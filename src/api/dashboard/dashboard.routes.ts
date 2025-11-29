// src/api/dashboard/dashboard.routes.ts

import { Router } from 'express';
import { getDashboardStats } from './dashboard.controller';

const router = Router();

// This route will provide the aggregated numbers for the dashboard cards.
router.get('/stats', getDashboardStats);

export default router;