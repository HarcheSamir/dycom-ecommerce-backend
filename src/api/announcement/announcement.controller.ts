// src/api/announcement/announcement.controller.ts

import { Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

/**
 * GET /api/announcements/active
 * Returns active announcements for the current user, filtered by:
 * - isActive = true
 * - startsAt <= now
 * - endsAt is null OR endsAt > now
 * - audience matches user's subscription status
 * - not dismissed by this user
 * Ordered by priority DESC, then createdAt DESC.
 */
export const getActiveAnnouncements = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const now = new Date();

        // Get the user's subscription status for audience filtering
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { subscriptionStatus: true },
        });

        if (!user) {
            return res.status(404).json({ message: 'Utilisateur introuvable.' });
        }

        // Build audience filter
        const audienceFilter: string[] = ['ALL'];
        switch (user.subscriptionStatus) {
            case 'ACTIVE':
            case 'LIFETIME_ACCESS':
                audienceFilter.push('SUBSCRIBERS');
                break;
            case 'SMMA_ONLY':
                audienceFilter.push('SMMA');
                break;
            case 'TRIALING':
                audienceFilter.push('TRIALING');
                break;
        }

        // Get dismissed announcement IDs for this user
        const dismissedIds = (
            await prisma.announcementDismissal.findMany({
                where: { userId },
                select: { announcementId: true },
            })
        ).map((d) => d.announcementId);

        const announcements = await prisma.announcement.findMany({
            where: {
                isActive: true,
                startsAt: { lte: now },
                OR: [
                    { endsAt: null },
                    { endsAt: { gt: now } },
                ],
                audience: { in: audienceFilter },
                id: { notIn: dismissedIds },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            select: {
                id: true,
                headline: true,
                description: true,
                type: true,
                imageUrl: true,
                videoVimeoId: true,
                ctaText: true,
                ctaUrl: true,
                isDismissible: true,
                colorScheme: true,
                customGradient: true,
                priority: true,
            },
        });

        res.json(announcements);
    } catch (error: any) {
        console.error('[Announcements] Get active error:', error);
        res.status(500).json({ message: 'Erreur lors du chargement des annonces.' });
    }
};

/**
 * POST /api/announcements/:id/dismiss
 * Dismisses an announcement for the current user.
 */
export const dismissAnnouncement = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const id = req.params.id as string;

        // Verify announcement exists and is dismissible
        const announcement = await prisma.announcement.findUnique({
            where: { id },
            select: { isDismissible: true },
        });

        if (!announcement) {
            return res.status(404).json({ message: 'Annonce introuvable.' });
        }

        if (!announcement.isDismissible) {
            return res.status(400).json({ message: 'Cette annonce ne peut pas être fermée.' });
        }

        // Upsert to avoid duplicate errors
        await prisma.announcementDismissal.upsert({
            where: {
                userId_announcementId: { userId, announcementId: id },
            },
            update: {},
            create: {
                userId,
                announcementId: id,
            },
        });

        res.json({ message: 'Annonce fermée.' });
    } catch (error: any) {
        console.error('[Announcements] Dismiss error:', error);
        res.status(500).json({ message: 'Erreur lors de la fermeture de l\'annonce.' });
    }
};
