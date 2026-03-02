// src/api/announcement/announcement.routes.ts

import { Router } from 'express';
import { getActiveAnnouncements, dismissAnnouncement } from './announcement.controller';

const router = Router();

// GET /api/announcements/active — Fetch active announcements for current user
router.get('/active', getActiveAnnouncements);

// POST /api/announcements/:id/dismiss — Dismiss an announcement
router.post('/:id/dismiss', dismissAnnouncement);

export default router;
