import { Request, Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

export const getPublicSettings = async (req: Request, res: Response) => {
    try {
        const settings = await prisma.setting.findMany({
            where: {
                key: { in: ['urgencyEnabled', 'disabledServices'] }
            }
        });

        const urgencySetting = settings.find(s => s.key === 'urgencyEnabled');
        const disabledServicesSetting = settings.find(s => s.key === 'disabledServices');

        const urgencyEnabled = urgencySetting ? urgencySetting.value === 'true' : true;
        let disabledServices: string[] = [];
        try {
            if (disabledServicesSetting?.value) {
                disabledServices = JSON.parse(disabledServicesSetting.value);
            }
        } catch (e) {
            console.error("Failed to parse disabledServices", e);
        }

        return res.json({ urgencyEnabled, disabledServices });
    } catch (error) {
        console.error('Error fetching public settings:', error);
        return res.status(500).json({ error: 'Failed to fetch settings' });
    }
};

export const updateSettings = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { urgencyEnabled, disabledServices } = req.body;

        const updates = [];

        if (typeof urgencyEnabled === 'boolean') {
            updates.push(
                prisma.setting.upsert({
                    where: { key: 'urgencyEnabled' },
                    update: { value: String(urgencyEnabled) },
                    create: { key: 'urgencyEnabled', value: String(urgencyEnabled) },
                })
            );
        }

        if (Array.isArray(disabledServices)) {
            updates.push(
                prisma.setting.upsert({
                    where: { key: 'disabledServices' },
                    update: { value: JSON.stringify(disabledServices) },
                    create: { key: 'disabledServices', value: JSON.stringify(disabledServices) },
                })
            );
        }

        if (updates.length > 0) {
            await prisma.$transaction(updates);
        }

        return res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        return res.status(500).json({ error: 'Failed to update settings' });
    }
};
