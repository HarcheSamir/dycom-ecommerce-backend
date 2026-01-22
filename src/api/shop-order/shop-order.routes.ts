// src/api/shop-order/shop-order.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { isAdminMiddleware } from '../../middleware/isAdmin.middleware';
import { shopOrderController } from './shop-order.controller';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads (memory storage for Cloudinary)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ===========================
// USER ROUTES (Authenticated)
// ===========================

// Get or create draft order
router.get('/draft', authMiddleware, shopOrderController.getDraft);

// Save/update draft (autosave)
router.post('/draft', authMiddleware, shopOrderController.saveDraft);

// Get trending products for selection
router.get('/trending-products', authMiddleware, shopOrderController.getTrendingProducts);

// Upload file to order
router.post('/:orderId/upload', authMiddleware, upload.single('file'), shopOrderController.uploadFile);

// Delete uploaded file
router.delete('/:orderId/files/:fileId', authMiddleware, shopOrderController.deleteFile);

// Submit order (after payment)
router.post('/:orderId/submit', authMiddleware, shopOrderController.submitOrder);

// Get user's orders history
router.get('/my-orders', authMiddleware, shopOrderController.getMyOrders);

// Get single order details (user)
router.get('/:orderId', authMiddleware, shopOrderController.getOrderDetails);

// ===========================
// ADMIN ROUTES
// ===========================

// Get all orders with filters
router.get('/admin/all', authMiddleware, isAdminMiddleware, shopOrderController.adminGetAllOrders);

// Get order stats for dashboard
router.get('/admin/stats', authMiddleware, isAdminMiddleware, shopOrderController.adminGetStats);

// Get single order details (admin)
router.get('/admin/:orderId', authMiddleware, isAdminMiddleware, shopOrderController.adminGetOrderDetails);

// Update order status
router.put('/admin/:orderId/status', authMiddleware, isAdminMiddleware, shopOrderController.adminUpdateStatus);

// Update admin notes (for assignment)
router.put('/admin/:orderId/notes', authMiddleware, isAdminMiddleware, shopOrderController.adminUpdateNotes);

export default router;
