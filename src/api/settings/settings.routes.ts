import { Router } from 'express';
import { getPublicSettings, updateSettings } from './settings.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { isAdminMiddleware } from '../../middleware/isAdmin.middleware';

const router = Router();

// Public route to get settings (used by Pricing/Billing pages)
router.get('/public', getPublicSettings);

// Admin route to update settings
router.patch('/', authMiddleware, isAdminMiddleware, updateSettings);

export default router;
