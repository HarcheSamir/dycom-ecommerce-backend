import { Router } from 'express';
import multer from 'multer';
import {
    createPublicTicket,
    getTicketByAccessToken,
    replyViaAccessToken,
    getUserTickets,
    createUserTicket,
    getAllTicketsAdmin,
    adminReplyTicket,
    adminGetTicketDetails,
    adminEditMessage,
    adminDeleteMessage
} from './support.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { isAdminMiddleware } from '../../middleware/isAdmin.middleware';

const router = Router();

// Configure multer for file uploads (memory storage for Cloudinary)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
    fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedMimes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
            'text/plain',
            'text/csv',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip',
            'application/x-zip-compressed',
            'application/octet-stream',
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} is not allowed`));
        }
    }
});

// --- PUBLIC (GUEST) ROUTES ---
router.post('/public/create', upload.array('files', 5), createPublicTicket);
router.get('/public/:ticketId', getTicketByAccessToken); // Requires ?key=...
router.post('/public/:ticketId/reply', upload.array('files', 5), replyViaAccessToken); // Requires body { key: ... }

// --- AUTHENTICATED USER ROUTES ---
router.get('/my-tickets', authMiddleware, getUserTickets);
router.post('/create', authMiddleware, upload.array('files', 5), createUserTicket);

// --- ADMIN ROUTES ---
router.get('/admin/all', authMiddleware, isAdminMiddleware, getAllTicketsAdmin);
router.get('/admin/:ticketId', authMiddleware, isAdminMiddleware, adminGetTicketDetails);
router.post('/admin/:ticketId/reply', authMiddleware, isAdminMiddleware, upload.array('files', 5), adminReplyTicket);
router.patch('/admin/message/:messageId', authMiddleware, isAdminMiddleware, adminEditMessage);
router.delete('/admin/message/:messageId', authMiddleware, isAdminMiddleware, adminDeleteMessage);

export default router;