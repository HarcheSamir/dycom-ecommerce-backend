// src/api/shop-order/shop-order.controller.ts

import { Response } from 'express';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { shopOrderService } from './shop-order.service';
import { v2 as cloudinary } from 'cloudinary';

// Cloudinary config (should match your existing setup)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

export const shopOrderController = {
    // ===========================
    // USER ENDPOINTS
    // ===========================

    /**
     * Get or create draft order for current user
     */
    async getDraft(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const order = await shopOrderService.getOrCreateDraft(userId);
            return res.json(order);
        } catch (error: any) {
            console.error('Error getting draft:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Save/update draft order (autosave)
     */
    async saveDraft(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const { orderId, ...data } = req.body;

            if (!orderId) {
                // Get or create draft first
                const draft = await shopOrderService.getOrCreateDraft(userId);
                const updated = await shopOrderService.saveDraft(userId, draft.id, data);
                return res.json(updated);
            }

            const order = await shopOrderService.saveDraft(userId, orderId, data);
            return res.json(order);
        } catch (error: any) {
            console.error('Error saving draft:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get trending products for selection
     */
    async getTrendingProducts(req: AuthenticatedRequest, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 4;
            const products = await shopOrderService.getTrendingProducts(limit);
            return res.json(products);
        } catch (error: any) {
            console.error('Error getting trending products:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Upload file to order
     */
    async uploadFile(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const { orderId } = req.params;
            const { fileType } = req.body; // 'logo', 'asset', 'reference', 'other'

            // Verify order belongs to user
            const order = await shopOrderService.getOrderById(orderId, userId);
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file provided' });
            }

            // Upload to Cloudinary
            const uploadResult = await new Promise<any>((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: `shop-orders/${orderId}`,
                        resource_type: 'auto'
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                uploadStream.end(req.file!.buffer);
            });

            // Save file record
            const fileRecord = await shopOrderService.addFile(orderId, {
                fileName: req.file.originalname,
                fileUrl: uploadResult.secure_url,
                fileType: fileType || 'other',
                mimeType: req.file.mimetype,
                fileSize: req.file.size,
                cloudinaryId: uploadResult.public_id
            });

            // If it's a logo upload, update the order
            if (fileType === 'logo') {
                await shopOrderService.saveDraft(userId, orderId, {
                    hasOwnLogo: true,
                    logoUrl: uploadResult.secure_url
                });
            }

            return res.json(fileRecord);
        } catch (error: any) {
            console.error('Error uploading file:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Delete uploaded file
     */
    async deleteFile(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const { orderId, fileId } = req.params;

            // Verify order belongs to user
            const order = await shopOrderService.getOrderById(orderId, userId);
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            // Find file
            const file = order.files.find((f: any) => f.id === fileId);
            if (!file) {
                return res.status(404).json({ error: 'File not found' });
            }

            // Delete from Cloudinary
            if (file.cloudinaryId) {
                await cloudinary.uploader.destroy(file.cloudinaryId);
            }

            // Delete from database
            await shopOrderService.deleteFile(orderId, fileId);

            return res.json({ success: true });
        } catch (error: any) {
            console.error('Error deleting file:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Submit order after payment
     */
    async submitOrder(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const { orderId } = req.params;

            const order = await shopOrderService.submitOrder(userId, orderId);
            return res.json(order);
        } catch (error: any) {
            console.error('Error submitting order:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    /**
     * Get user's orders
     */
    async getMyOrders(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const orders = await shopOrderService.getUserOrders(userId);
            return res.json(orders);
        } catch (error: any) {
            console.error('Error getting orders:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Get single order details
     */
    async getOrderDetails(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const { orderId } = req.params;

            const order = await shopOrderService.getOrderById(orderId, userId);
            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            return res.json(order);
        } catch (error: any) {
            console.error('Error getting order:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    // ===========================
    // ADMIN ENDPOINTS
    // ===========================

    /**
     * Admin: Get all orders with filters
     */
    async adminGetAllOrders(req: AuthenticatedRequest, res: Response) {
        try {
            const { status, paymentStatus, search, page, limit } = req.query;

            const result = await shopOrderService.adminGetAllOrders({
                status: status as any,
                paymentStatus: paymentStatus as any,
                search: search as string,
                page: page ? parseInt(page as string) : 1,
                limit: limit ? parseInt(limit as string) : 20
            });

            return res.json(result);
        } catch (error: any) {
            console.error('Error getting orders:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Admin: Get stats for dashboard
     */
    async adminGetStats(req: AuthenticatedRequest, res: Response) {
        try {
            const stats = await shopOrderService.adminGetStats();
            return res.json(stats);
        } catch (error: any) {
            console.error('Error getting stats:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Admin: Get single order details
     */
    async adminGetOrderDetails(req: AuthenticatedRequest, res: Response) {
        try {
            const { orderId } = req.params;
            const order = await shopOrderService.getOrderById(orderId);

            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            return res.json(order);
        } catch (error: any) {
            console.error('Error getting order:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Admin: Update order status
     */
    async adminUpdateStatus(req: AuthenticatedRequest, res: Response) {
        try {
            const { orderId } = req.params;
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({ error: 'Status is required' });
            }

            const order = await shopOrderService.adminUpdateStatus(orderId, status);
            return res.json(order);
        } catch (error: any) {
            console.error('Error updating status:', error);
            return res.status(500).json({ error: error.message });
        }
    },

    /**
     * Admin: Update notes (for assignment filtering)
     */
    async adminUpdateNotes(req: AuthenticatedRequest, res: Response) {
        try {
            const { orderId } = req.params;
            const { notes } = req.body;

            const order = await shopOrderService.adminUpdateNotes(orderId, notes || '');
            return res.json(order);
        } catch (error: any) {
            console.error('Error updating notes:', error);
            return res.status(500).json({ error: error.message });
        }
    }
};
