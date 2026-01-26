
import { Router } from 'express';
import { chatWithAgent } from './academy-agent.controller';

const router = Router();

import { authMiddleware } from '../../middleware/auth.middleware';

// POST /api/academy-agent/chat
router.post('/chat', authMiddleware, chatWithAgent);

export default router;
