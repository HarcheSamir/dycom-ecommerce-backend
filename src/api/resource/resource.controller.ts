// src/api/resource/resource.controller.ts

import { Request, Response } from 'express';
import { prisma } from '../../index';
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

export const resourceController = {
    // ============================================
    // USER ENDPOINTS
    // ============================================

    // Get all categories with their resources (for users)
    getAllResources: async (req: Request, res: Response) => {
        try {
            const categories = await prisma.resourceCategory.findMany({
                orderBy: { order: 'asc' },
                include: {
                    resources: {
                        where: { isPublished: true },
                        orderBy: { order: 'asc' },
                    },
                },
            });

            res.json(categories);
        } catch (error) {
            console.error('Error fetching resources:', error);
            res.status(500).json({ message: 'Failed to fetch resources' });
        }
    },

    // Get just categories (for filtering)
    getCategories: async (req: Request, res: Response) => {
        try {
            const categories = await prisma.resourceCategory.findMany({
                orderBy: { order: 'asc' },
                include: {
                    _count: {
                        select: { resources: { where: { isPublished: true } } },
                    },
                },
            });

            res.json(categories);
        } catch (error) {
            console.error('Error fetching categories:', error);
            res.status(500).json({ message: 'Failed to fetch categories' });
        }
    },

    // Get single resource (for download tracking, etc.)
    getResourceById: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const resource = await prisma.resource.findUnique({
                where: { id, isPublished: true },
                include: { category: true },
            });

            if (!resource) {
                return res.status(404).json({ message: 'Resource not found' });
            }

            res.json(resource);
        } catch (error) {
            console.error('Error fetching resource:', error);
            res.status(500).json({ message: 'Failed to fetch resource' });
        }
    },

    // ============================================
    // ADMIN ENDPOINTS - Categories
    // ============================================

    getAdminCategories: async (req: Request, res: Response) => {
        try {
            const categories = await prisma.resourceCategory.findMany({
                orderBy: { order: 'asc' },
                include: {
                    _count: { select: { resources: true } },
                },
            });

            res.json(categories);
        } catch (error) {
            console.error('Error fetching admin categories:', error);
            res.status(500).json({ message: 'Failed to fetch categories' });
        }
    },

    createCategory: async (req: Request, res: Response) => {
        try {
            const { name, description, icon } = req.body;

            if (!name) {
                return res.status(400).json({ message: 'Category name is required' });
            }

            // Get next order value
            const maxOrder = await prisma.resourceCategory.aggregate({
                _max: { order: true },
            });

            const category = await prisma.resourceCategory.create({
                data: {
                    name,
                    description,
                    icon,
                    order: (maxOrder._max.order || 0) + 1,
                },
            });

            res.status(201).json(category);
        } catch (error: any) {
            console.error('Error creating category:', error);
            if (error.code === 'P2002') {
                return res.status(400).json({ message: 'Category name already exists' });
            }
            res.status(500).json({ message: 'Failed to create category' });
        }
    },

    updateCategory: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { name, description, icon, order } = req.body;

            const category = await prisma.resourceCategory.update({
                where: { id },
                data: { name, description, icon, order },
            });

            res.json(category);
        } catch (error: any) {
            console.error('Error updating category:', error);
            if (error.code === 'P2025') {
                return res.status(404).json({ message: 'Category not found' });
            }
            res.status(500).json({ message: 'Failed to update category' });
        }
    },

    deleteCategory: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            // Get all resources in this category to delete from Cloudinary
            const resources = await prisma.resource.findMany({
                where: { categoryId: id, cloudinaryId: { not: null } },
            });

            // Delete files from Cloudinary
            for (const resource of resources) {
                if (resource.cloudinaryId) {
                    try {
                        await cloudinary.uploader.destroy(resource.cloudinaryId, { resource_type: 'raw' });
                    } catch (err) {
                        console.error(`Failed to delete ${resource.cloudinaryId} from Cloudinary:`, err);
                    }
                }
            }

            // Delete category (cascades to resources)
            await prisma.resourceCategory.delete({ where: { id } });

            res.json({ message: 'Category deleted successfully' });
        } catch (error: any) {
            console.error('Error deleting category:', error);
            if (error.code === 'P2025') {
                return res.status(404).json({ message: 'Category not found' });
            }
            res.status(500).json({ message: 'Failed to delete category' });
        }
    },

    // ============================================
    // ADMIN ENDPOINTS - Resources
    // ============================================

    getAdminResources: async (req: Request, res: Response) => {
        try {
            const resources = await prisma.resource.findMany({
                orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }],
                include: { category: true },
            });

            res.json(resources);
        } catch (error) {
            console.error('Error fetching admin resources:', error);
            res.status(500).json({ message: 'Failed to fetch resources' });
        }
    },

    // Create resource with file upload
    createResource: async (req: Request, res: Response) => {
        try {
            const { title, description, categoryId, isPublished } = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ message: 'File is required' });
            }

            if (!title || !categoryId) {
                return res.status(400).json({ message: 'Title and category are required' });
            }

            // Check category exists
            const category = await prisma.resourceCategory.findUnique({
                where: { id: categoryId },
            });

            if (!category) {
                return res.status(400).json({ message: 'Invalid category' });
            }

            // Upload to Cloudinary
            const uploadResult = await uploadToCloudinary(file.buffer, {
                folder: 'dycom-resources',
                resource_type: 'raw',
                public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
            });

            // Get next order value
            const maxOrder = await prisma.resource.aggregate({
                where: { categoryId },
                _max: { order: true },
            });

            // Create resource record
            const resource = await prisma.resource.create({
                data: {
                    title,
                    description,
                    type: 'FILE',
                    fileUrl: uploadResult.secure_url,
                    fileName: file.originalname,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    cloudinaryId: uploadResult.public_id,
                    categoryId,
                    order: (maxOrder._max.order || 0) + 1,
                    isPublished: isPublished === 'true' || isPublished === true,
                },
                include: { category: true },
            });

            res.status(201).json(resource);
        } catch (error) {
            console.error('Error creating resource:', error);
            res.status(500).json({ message: 'Failed to create resource' });
        }
    },

    // Create URL resource (no file upload)
    createUrlResource: async (req: Request, res: Response) => {
        try {
            const { title, description, categoryId, externalUrl, isPublished } = req.body;

            if (!title || !categoryId || !externalUrl) {
                return res.status(400).json({ message: 'Title, category, and URL are required' });
            }

            // Check category exists
            const category = await prisma.resourceCategory.findUnique({
                where: { id: categoryId },
            });

            if (!category) {
                return res.status(400).json({ message: 'Invalid category' });
            }

            // Get next order value
            const maxOrder = await prisma.resource.aggregate({
                where: { categoryId },
                _max: { order: true },
            });

            const resource = await prisma.resource.create({
                data: {
                    title,
                    description,
                    type: 'URL',
                    externalUrl,
                    categoryId,
                    order: (maxOrder._max.order || 0) + 1,
                    isPublished: isPublished ?? true,
                },
                include: { category: true },
            });

            res.status(201).json(resource);
        } catch (error) {
            console.error('Error creating URL resource:', error);
            res.status(500).json({ message: 'Failed to create resource' });
        }
    },

    updateResource: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { title, description, categoryId, externalUrl, isPublished, order } = req.body;

            const resource = await prisma.resource.update({
                where: { id },
                data: {
                    title,
                    description,
                    categoryId,
                    externalUrl,
                    isPublished,
                    order,
                },
                include: { category: true },
            });

            res.json(resource);
        } catch (error: any) {
            console.error('Error updating resource:', error);
            if (error.code === 'P2025') {
                return res.status(404).json({ message: 'Resource not found' });
            }
            res.status(500).json({ message: 'Failed to update resource' });
        }
    },

    deleteResource: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            // Get resource to delete from Cloudinary
            const resource = await prisma.resource.findUnique({ where: { id } });

            if (!resource) {
                return res.status(404).json({ message: 'Resource not found' });
            }

            // Delete from Cloudinary if it's a file
            if (resource.cloudinaryId) {
                try {
                    await cloudinary.uploader.destroy(resource.cloudinaryId, { resource_type: 'raw' });
                } catch (err) {
                    console.error('Failed to delete from Cloudinary:', err);
                }
            }

            // Delete from database
            await prisma.resource.delete({ where: { id } });

            res.json({ message: 'Resource deleted successfully' });
        } catch (error) {
            console.error('Error deleting resource:', error);
            res.status(500).json({ message: 'Failed to delete resource' });
        }
    },

    reorderResources: async (req: Request, res: Response) => {
        try {
            const { resources } = req.body; // Array of { id, order }

            if (!Array.isArray(resources)) {
                return res.status(400).json({ message: 'Resources array is required' });
            }

            // Update all resources in a transaction
            await prisma.$transaction(
                resources.map((r: { id: string; order: number }) =>
                    prisma.resource.update({
                        where: { id: r.id },
                        data: { order: r.order },
                    })
                )
            );

            res.json({ message: 'Resources reordered successfully' });
        } catch (error) {
            console.error('Error reordering resources:', error);
            res.status(500).json({ message: 'Failed to reorder resources' });
        }
    },
};
