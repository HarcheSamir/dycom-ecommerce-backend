import { Request, Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { sendTicketCreatedEmail, sendTicketReplyEmail } from '../../utils/sendEmail';
import { SenderType, TicketStatus, TicketPriority } from '@prisma/client';

// --- 1. PUBLIC / GUEST ACTIONS ---

export const createPublicTicket = async (req: Request, res: Response) => {
    try {
        const { name, email, subject, message, category } = req.body;

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
            }
        });

        // Send Email
        const userName = existingUser ? existingUser.firstName : (name || 'Guest');
        await sendTicketCreatedEmail(email, userName, ticket.id, ticket.accessToken, subject);

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
            where: { id: ticketId },
            include: {
                messages: { orderBy: { createdAt: 'asc' } }
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

        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });

        if (!ticket || ticket.accessToken !== key) {
            return res.status(403).json({ error: 'Invalid Credentials.' });
        }

        const newMessage = await prisma.ticketMessage.create({
            data: {
                ticketId,
                content: message,
                senderType: ticket.userId ? SenderType.USER : SenderType.GUEST,
                senderId: ticket.userId || null,
            }
        });

        // Re-open ticket if it was closed
        if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
            await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'OPEN' } });
        }

        res.status(201).json(newMessage);
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

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if(!user) return res.status(404).json({error: "User not found"});

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
            }
        });

        await sendTicketCreatedEmail(user.email, user.firstName, ticket.id, ticket.accessToken, subject);
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
            orderBy: { updatedAt: 'desc' }, // Updated recently first
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
        const { message, newStatus, isInternal } = req.body; // isInternal = Private Note
        const adminId = req.user!.userId;

        // 1. Save Message
        const ticketMsg = await prisma.ticketMessage.create({
            data: {
                ticketId,
                content: message,
                senderType: SenderType.ADMIN,
                senderId: adminId,
                isInternal: isInternal || false
            }
        });

        // 2. Update Ticket Status (optional)
        const updateData: any = { updatedAt: new Date() };
        if (newStatus) updateData.status = newStatus;
        
        const ticket = await prisma.ticket.update({
            where: { id: ticketId },
            data: updateData
        });

        // 3. Send Email Notification (ONLY if not internal note)
        if (!isInternal) {
            const recipientEmail = ticket.guestEmail; // Always populated
            const recipientName = ticket.guestName || "Customer";
            
            if (recipientEmail) {
                await sendTicketReplyEmail(recipientEmail, recipientName, ticket.id, ticket.accessToken, message);
            }
        }

        res.status(200).json(ticketMsg);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to reply' });
    }
};

export const adminGetTicketDetails = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { ticketId } = req.params;
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                messages: { orderBy: { createdAt: 'asc' } },
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
        if(!ticket) return res.status(404).json({error: "Ticket not found"});
        res.status(200).json(ticket);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching details' });
    }
};