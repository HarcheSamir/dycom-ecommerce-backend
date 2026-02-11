import { Request, Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { sendTicketCreatedEmail, sendTicketReplyEmail, sendNewTicketAlertToAdmins, sendTicketReplyAlertToAdmins } from '../../utils/sendEmail';
import { SenderType, TicketStatus, TicketPriority } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (buffer: Buffer, options: any): Promise<any> => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
        uploadStream.end(buffer);
    });
};

// Helper to create attachments for a message
const createAttachmentsFromFiles = async (messageId: string, files: Express.Multer.File[], ticketId: string): Promise<void> => {
    if (!files || files.length === 0) return;

    for (const file of files) {
        try {
            const uploadResult = await uploadToCloudinary(file.buffer, {
                folder: `support-tickets/${ticketId}`,
                resource_type: 'auto'
            });

            await prisma.ticketAttachment.create({
                data: {
                    messageId,
                    fileName: file.originalname,
                    fileUrl: uploadResult.secure_url,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    cloudinaryId: uploadResult.public_id
                }
            });
        } catch (error) {
            console.error('Failed to upload attachment:', error);
            // Continue with other files even if one fails
        }
    }
};

// --- 1. PUBLIC / GUEST ACTIONS ---

export const createPublicTicket = async (req: Request, res: Response) => {
    try {
        const { name, email, subject, message, category } = req.body;
        const files = req.files as Express.Multer.File[] | undefined;

        if (!email || !subject || !message) {
            return res.status(400).json({ error: 'Email, Subject, and Message are required.' });
        }

        // Check if user actually exists (optional: link them automatically if found)
        const existingUser = await prisma.user.findUnique({ where: { email } });

        const ticket = await prisma.ticket.create({
            data: {
                subject,
                category: category || 'GENERAL',
                guestName: existingUser ? `${existingUser.firstName} ${existingUser.lastName}` : name,
                guestEmail: email,
                userId: existingUser ? existingUser.id : undefined, // Link if exists
                messages: {
                    create: {
                        content: message,
                        senderType: existingUser ? SenderType.USER : SenderType.GUEST,
                        senderId: existingUser ? existingUser.id : null
                    }
                }
            },
            include: {
                messages: true
            }
        });

        // Upload attachments if any
        if (files && files.length > 0 && ticket.messages[0]) {
            await createAttachmentsFromFiles(ticket.messages[0].id, files, ticket.id);
        }

        // Send Email to Guest
        const userName = existingUser ? existingUser.firstName : (name || 'Guest');
        await sendTicketCreatedEmail(email, userName, ticket.id, ticket.accessToken, subject);

        // ALERT ADMINS
        await sendNewTicketAlertToAdmins(ticket.id, subject, email, userName, message);

        res.status(201).json({ message: 'Ticket created', ticketId: ticket.id, accessToken: ticket.accessToken });
    } catch (error) {
        console.error('Error creating public ticket:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getTicketByAccessToken = async (req: Request, res: Response) => {
    try {
        const { ticketId } = req.params;
        const { key } = req.query; // Access Token passed as query param

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId as string },
            include: {
                messages: {
                    where: { isDeleted: false }, // Hide deleted messages from users
                    orderBy: { createdAt: 'asc' },
                    include: {
                        attachments: true
                    }
                }
            }
        });

        if (!ticket || ticket.accessToken !== key) {
            return res.status(403).json({ error: 'Invalid Ticket ID or Access Key.' });
        }

        res.status(200).json(ticket);
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const replyViaAccessToken = async (req: Request, res: Response) => {
    try {
        const { ticketId } = req.params;
        const { key, message } = req.body;
        const files = req.files as Express.Multer.File[] | undefined;

        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId as string } });

        if (!ticket || ticket.accessToken !== key) {
            return res.status(403).json({ error: 'Invalid Credentials.' });
        }

        const newMessage = await prisma.ticketMessage.create({
            data: {
                ticketId: ticketId as string,
                content: message,
                senderType: ticket.userId ? SenderType.USER : SenderType.GUEST,
                senderId: ticket.userId || null,
            }
        });

        // Upload attachments if any
        if (files && files.length > 0) {
            await createAttachmentsFromFiles(newMessage.id, files, ticketId as string);
        }

        // Re-open ticket if it was closed/in-progress, and mark as unread for admin
        const shouldReopen = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' || ticket.status === 'IN_PROGRESS';
        await prisma.ticket.update({
            where: { id: ticketId as string },
            data: {
                status: shouldReopen ? 'OPEN' : undefined,
                adminUnread: true // Customer replied, admin needs to see this
            }
        });

        // ALERT ADMINS (Guest/User replied via magic link)
        await sendTicketReplyAlertToAdmins(
            ticket.id,
            ticket.guestEmail,
            ticket.guestName,
            message
        );

        // Fetch message with attachments for response
        const messageWithAttachments = await prisma.ticketMessage.findUnique({
            where: { id: newMessage.id },
            include: { attachments: true }
        });

        res.status(201).json(messageWithAttachments);
    } catch (error) {
        console.error('Error replying to ticket:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// --- 2. AUTHENTICATED USER ACTIONS ---

export const getUserTickets = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const tickets = await prisma.ticket.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            include: {
                messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' } // Get last message snippet
                }
            }
        });
        res.status(200).json(tickets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
};

export const createUserTicket = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const { subject, message, category } = req.body;
        const files = req.files as Express.Multer.File[] | undefined;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: "User not found" });

        const ticket = await prisma.ticket.create({
            data: {
                userId,
                subject,
                category: category || 'GENERAL',
                guestEmail: user.email, // Fallback for notifications
                guestName: `${user.firstName} ${user.lastName}`,
                messages: {
                    create: {
                        content: message,
                        senderType: SenderType.USER,
                        senderId: userId
                    }
                }
            },
            include: {
                messages: true
            }
        });

        // Upload attachments if any
        if (files && files.length > 0 && ticket.messages[0]) {
            await createAttachmentsFromFiles(ticket.messages[0].id, files, ticket.id);
        }

        await sendTicketCreatedEmail(user.email, user.firstName, ticket.id, ticket.accessToken, subject);

        // ALERT ADMINS
        await sendNewTicketAlertToAdmins(ticket.id, subject, user.email, `${user.firstName} ${user.lastName}`, message);
        res.status(201).json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create ticket' });
    }
};

// --- 3. ADMIN ACTIONS ---

export const getAllTicketsAdmin = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        const where: any = {};
        if (status && status !== 'ALL') {
            where.status = status;
        }

        const tickets = await prisma.ticket.findMany({
            where,
            orderBy: [
                { adminUnread: 'desc' }, // Unread tickets first
                { updatedAt: 'desc' }     // Then by most recently updated
            ],
            take: Number(limit),
            skip: (Number(page) - 1) * Number(limit),
            include: {
                user: {
                    select: {
                        email: true,
                        firstName: true,
                        lastName: true,
                        subscriptionStatus: true,
                        installmentsPaid: true // LTV Context
                    }
                },
                messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                    where: { isInternal: false } // Only show public messages as preview
                },
                _count: { select: { messages: true } }
            }
        });

        const total = await prisma.ticket.count({ where });

        res.status(200).json({ data: tickets, meta: { total, page: Number(page), limit: Number(limit) } });
    } catch (error) {
        res.status(500).json({ error: 'Admin fetch error' });
    }
};

export const adminReplyTicket = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { ticketId } = req.params;
        const { message, newStatus, isInternal: isInternalRaw } = req.body; // isInternal = Private Note
        const adminId = req.user!.userId;
        const files = req.files as Express.Multer.File[] | undefined;

        // Parse isInternal from FormData string
        const isInternal = isInternalRaw === true || isInternalRaw === 'true';

        // 1. Save Message
        const ticketMsg = await prisma.ticketMessage.create({
            data: {
                ticketId: ticketId as string,
                content: message,
                senderType: SenderType.ADMIN,
                senderId: adminId,
                isInternal
            }
        });

        // 2. Upload attachments if any (only for non-internal messages)
        if (files && files.length > 0 && !isInternal) {
            await createAttachmentsFromFiles(ticketMsg.id, files, ticketId as string);
        }

        // 3. Update Ticket Status and mark as read (admin replied)
        const updateData: any = { updatedAt: new Date(), adminUnread: false };
        if (newStatus) updateData.status = newStatus;

        const ticket = await prisma.ticket.update({
            where: { id: ticketId as string },
            data: updateData
        });

        // 4. Send Email Notification (ONLY if not internal note)
        if (!isInternal) {
            const recipientEmail = ticket.guestEmail; // Always populated
            const recipientName = ticket.guestName || "Customer";

            if (recipientEmail) {
                await sendTicketReplyEmail(recipientEmail, recipientName, ticket.id, ticket.accessToken, message);
            }
        }

        // Fetch message with attachments for response
        const messageWithAttachments = await prisma.ticketMessage.findUnique({
            where: { id: ticketMsg.id },
            include: { attachments: true }
        });

        res.status(200).json(messageWithAttachments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to reply' });
    }
};

export const adminGetTicketDetails = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { ticketId } = req.params;
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId as string },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        attachments: true
                    }
                },
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true,
                        subscriptionStatus: true,
                        createdAt: true
                    }
                }
            }
        });
        if (!ticket) return res.status(404).json({ error: "Ticket not found" });

        // Mark as read when admin opens the ticket
        if (ticket.adminUnread) {
            await prisma.ticket.update({
                where: { id: ticketId as string },
                data: {
                    adminUnread: false,
                    updatedAt: ticket.updatedAt // Preserve existing updated timestamp
                }
            });
        }

        res.status(200).json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching details' });
    }
};

// --- ADMIN: EDIT MESSAGE ---
export const adminEditMessage = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const messageId = req.params.messageId as string;
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Content is required' });
        }

        // Verify message exists and was sent by admin
        const message = await prisma.ticketMessage.findUnique({ where: { id: messageId } });

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.senderType !== 'ADMIN') {
            return res.status(403).json({ error: 'Can only edit admin messages' });
        }

        if (message.isDeleted) {
            return res.status(400).json({ error: 'Cannot edit a deleted message' });
        }

        const updated = await prisma.ticketMessage.update({
            where: { id: messageId },
            data: {
                content: content.trim(),
                editedAt: new Date()
            }
        });

        res.status(200).json(updated);
    } catch (error) {
        console.error('Error editing message:', error);
        res.status(500).json({ error: 'Failed to edit message' });
    }
};

// --- ADMIN: SOFT DELETE MESSAGE ---
export const adminDeleteMessage = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const messageId = req.params.messageId as string;

        // Verify message exists and was sent by admin
        const message = await prisma.ticketMessage.findUnique({ where: { id: messageId } });

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.senderType !== 'ADMIN') {
            return res.status(403).json({ error: 'Can only delete admin messages' });
        }

        if (message.isDeleted) {
            return res.status(400).json({ error: 'Message already deleted' });
        }

        const deleted = await prisma.ticketMessage.update({
            where: { id: messageId },
            data: {
                isDeleted: true,
                deletedAt: new Date()
            }
        });

        res.status(200).json(deleted);
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
};