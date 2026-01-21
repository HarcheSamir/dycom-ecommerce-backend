// src/api/resource/resource.routes.ts

import { Router } from 'express';
import multer from 'multer';
import { resourceController } from './resource.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { hasMembershipMiddleware } from '../../middleware/hasMembership.middleware';
import { isAdminMiddleware } from '../../middleware/isAdmin.middleware';

const router = Router();

// Configure multer for memory storage (files go to Cloudinary)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedMimes = [
            'application/pdf',
            'application/json',
            'text/csv',
            'text/plain',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/zip',
            'application/x-zip-compressed',
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} is not allowed`));
        }
    },
});

// --- ADMIN ROUTES (must come BEFORE /:id to prevent route conflicts) ---
// Categories
router.get('/admin/categories', authMiddleware, isAdminMiddleware, resourceController.getAdminCategories);
router.post('/admin/categories', authMiddleware, isAdminMiddleware, resourceController.createCategory);
router.put('/admin/categories/:id', authMiddleware, isAdminMiddleware, resourceController.updateCategory);
router.delete('/admin/categories/:id', authMiddleware, isAdminMiddleware, resourceController.deleteCategory);

// Resources
router.get('/admin/all', authMiddleware, isAdminMiddleware, resourceController.getAdminResources);
router.post('/admin/upload', authMiddleware, isAdminMiddleware, upload.single('file'), resourceController.createResource);
router.post('/admin/url', authMiddleware, isAdminMiddleware, resourceController.createUrlResource);
router.put('/admin/reorder', authMiddleware, isAdminMiddleware, resourceController.reorderResources);
router.put('/admin/:id', authMiddleware, isAdminMiddleware, resourceController.updateResource);
router.delete('/admin/:id', authMiddleware, isAdminMiddleware, resourceController.deleteResource);

// --- PUBLIC/USER ROUTES (requires auth + membership) ---
router.get('/', authMiddleware, hasMembershipMiddleware, resourceController.getAllResources);
router.get('/categories', authMiddleware, hasMembershipMiddleware, resourceController.getCategories);
router.get('/:id', authMiddleware, hasMembershipMiddleware, resourceController.getResourceById);

export default router;