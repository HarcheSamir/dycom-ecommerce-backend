// src/api/admin/announcement.controller.ts

import { Request, Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { v2 as cloudinary } from 'cloudinary';

// ============================================================
// ADMIN ENDPOINTS — /api/admin/announcements
// ============================================================

/**
 * GET /api/admin/announcements
 * Lists all announcements with pagination and sorting.
 */
export const getAnnouncements = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [announcements, total] = await Promise.all([
            prisma.announcement.findMany({
                skip,
                take: limit,
                orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
                include: {
                    creator: {
                        select: { firstName: true, lastName: true, email: true },
                    },
                    _count: {
                        select: { dismissals: true },
                    },
                },
            }),
            prisma.announcement.count(),
        ]);

        res.json({
            data: announcements,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('[Announcements] List error:', error);
        res.status(500).json({ message: 'Erreur lors du chargement des annonces.' });
    }
};

/**
 * POST /api/admin/announcements
 * Creates a new announcement. Supports image upload via multer.
 */
export const createAnnouncement = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const {
            title, headline, description, type,
            videoVimeoId, ctaText, ctaUrl,
            audience, startsAt, endsAt,
            isActive, priority, isDismissible,
            colorScheme, customGradient,
        } = req.body;

        if (!title || !headline) {
            return res.status(400).json({ message: 'Title et headline sont requis.' });
        }

        let imageUrl: string | null = null;
        let cloudinaryId: string | null = null;

        // Handle image upload
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'announcements',
                resource_type: 'image',
            });
            imageUrl = result.secure_url;
            cloudinaryId = result.public_id;
        }

        const announcement = await prisma.announcement.create({
            data: {
                title,
                headline,
                description: description || null,
                type: type || 'BANNER',
                imageUrl,
                cloudinaryId,
                videoVimeoId: videoVimeoId || null,
                ctaText: ctaText || null,
                ctaUrl: ctaUrl || null,
                audience: audience || 'ALL',
                startsAt: startsAt ? new Date(startsAt) : new Date(),
                endsAt: endsAt ? new Date(endsAt) : null,
                isActive: isActive === 'false' ? false : true,
                priority: parseInt(priority) || 0,
                isDismissible: isDismissible === 'false' ? false : true,
                colorScheme: colorScheme || 'purple',
                customGradient: customGradient || null,
                createdBy: req.user!.userId,
            },
            include: {
                creator: {
                    select: { firstName: true, lastName: true, email: true },
                },
            },
        });

        res.status(201).json(announcement);
    } catch (error: any) {
        console.error('[Announcements] Create error:', error);
        res.status(500).json({ message: 'Erreur lors de la création de l\'annonce.' });
    }
};

/**
 * PUT /api/admin/announcements/:id
 * Updates an existing announcement. Supports replacing image.
 */
export const updateAnnouncement = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const {
            title, headline, description, type,
            videoVimeoId, ctaText, ctaUrl,
            audience, startsAt, endsAt,
            isActive, priority, isDismissible,
            colorScheme, customGradient,
            removeImage,
        } = req.body;

        const existing = await prisma.announcement.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Annonce introuvable.' });
        }

        let imageUrl = existing.imageUrl;
        let cloudinaryIdVal = existing.cloudinaryId;

        // Handle new image upload — delete old one first
        if (req.file) {
            if (existing.cloudinaryId) {
                await cloudinary.uploader.destroy(existing.cloudinaryId).catch(() => { });
            }
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'announcements',
                resource_type: 'image',
            });
            imageUrl = result.secure_url;
            cloudinaryIdVal = result.public_id;
        } else if (removeImage === 'true') {
            // Admin explicitly wants to remove the image
            if (existing.cloudinaryId) {
                await cloudinary.uploader.destroy(existing.cloudinaryId).catch(() => { });
            }
            imageUrl = null;
            cloudinaryIdVal = null;
        }

        const updated = await prisma.announcement.update({
            where: { id },
            data: {
                title: title ?? existing.title,
                headline: headline ?? existing.headline,
                description: description !== undefined ? (description || null) : existing.description,
                type: type ?? existing.type,
                imageUrl,
                cloudinaryId: cloudinaryIdVal,
                videoVimeoId: videoVimeoId !== undefined ? (videoVimeoId || null) : existing.videoVimeoId,
                ctaText: ctaText !== undefined ? (ctaText || null) : existing.ctaText,
                ctaUrl: ctaUrl !== undefined ? (ctaUrl || null) : existing.ctaUrl,
                audience: audience ?? existing.audience,
                startsAt: startsAt ? new Date(startsAt) : existing.startsAt,
                endsAt: endsAt ? new Date(endsAt) : (endsAt === '' || endsAt === null ? null : existing.endsAt),
                isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : existing.isActive,
                priority: priority !== undefined ? parseInt(priority) : existing.priority,
                isDismissible: isDismissible !== undefined ? (isDismissible === 'true' || isDismissible === true) : existing.isDismissible,
                colorScheme: colorScheme ?? existing.colorScheme,
                customGradient: customGradient !== undefined ? (customGradient || null) : existing.customGradient,
            },
            include: {
                creator: {
                    select: { firstName: true, lastName: true, email: true },
                },
                _count: {
                    select: { dismissals: true },
                },
            },
        });

        res.json(updated);
    } catch (error: any) {
        console.error('[Announcements] Update error:', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'annonce.' });
    }
};

/**
 * DELETE /api/admin/announcements/:id
 * Deletes an announcement and its Cloudinary image.
 */
export const deleteAnnouncement = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;

        const existing = await prisma.announcement.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Annonce introuvable.' });
        }

        // Delete Cloudinary image
        if (existing.cloudinaryId) {
            await cloudinary.uploader.destroy(existing.cloudinaryId).catch(() => { });
        }

        // Cascade deletes dismissals via Prisma relation
        await prisma.announcement.delete({ where: { id } });

        res.json({ message: 'Annonce supprimée avec succès.' });
    } catch (error: any) {
        console.error('[Announcements] Delete error:', error);
        res.status(500).json({ message: 'Erreur lors de la suppression de l\'annonce.' });
    }
};

/**
 * PUT /api/admin/announcements/:id/toggle
 * Quick active/inactive toggle.
 */
export const toggleAnnouncement = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;

        const existing = await prisma.announcement.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Annonce introuvable.' });
        }

        const updated = await prisma.announcement.update({
            where: { id },
            data: { isActive: !existing.isActive },
        });

        res.json(updated);
    } catch (error: any) {
        console.error('[Announcements] Toggle error:', error);
        res.status(500).json({ message: 'Erreur lors du changement de statut.' });
    }
};
