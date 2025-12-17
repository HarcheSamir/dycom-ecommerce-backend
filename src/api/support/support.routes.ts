import { Router } from 'express';
import { 
    createPublicTicket, 
    getTicketByAccessToken, 
    replyViaAccessToken,
    getUserTickets,
    createUserTicket,
    getAllTicketsAdmin,
    adminReplyTicket,
    adminGetTicketDetails
} from './support.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { isAdminMiddleware } from '../../middleware/isAdmin.middleware';

const router = Router();

// --- PUBLIC (GUEST) ROUTES ---
router.post('/public/create', createPublicTicket);
router.get('/public/:ticketId', getTicketByAccessToken); // Requires ?key=...
router.post('/public/:ticketId/reply', replyViaAccessToken); // Requires body { key: ... }

// --- AUTHENTICATED USER ROUTES ---
router.get('/my-tickets', authMiddleware, getUserTickets);
router.post('/create', authMiddleware, createUserTicket);

// --- ADMIN ROUTES ---
router.get('/admin/all', authMiddleware, isAdminMiddleware, getAllTicketsAdmin);
router.get('/admin/:ticketId', authMiddleware, isAdminMiddleware, adminGetTicketDetails);
router.post('/admin/:ticketId/reply', authMiddleware, isAdminMiddleware, adminReplyTicket);

export default router;