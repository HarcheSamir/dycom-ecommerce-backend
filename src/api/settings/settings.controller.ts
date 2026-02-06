import { Request, Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

export const getPublicSettings = async (req: Request, res: Response) => {
    try {
        const urgency = await prisma.setting.findUnique({ where: { key: 'urgencyEnabled' } });

        // Default to TRUE if not set
        const urgencyEnabled = urgency ? urgency.value === 'true' : true;

        return res.json({ urgencyEnabled });
    } catch (error) {
        console.error('Error fetching public settings:', error);
        return res.status(500).json({ error: 'Failed to fetch settings' });
    }
};

export const updateSettings = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { urgencyEnabled } = req.body;

        if (typeof urgencyEnabled === 'boolean') {
            await prisma.setting.upsert({
                where: { key: 'urgencyEnabled' },
                update: { value: String(urgencyEnabled) },
                create: { key: 'urgencyEnabled', value: String(urgencyEnabled) },
            });
        }

        return res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        return res.status(500).json({ error: 'Failed to update settings' });
    }
};
