
import { Router } from 'express';
import { chatWithAgent } from './academy-agent.controller';

const router = Router();

import { authMiddleware } from '../../middleware/auth.middleware';
import { agentRateLimiter } from '../../middleware/rateLimit.middleware';

// POST /api/academy-agent/chat
router.post('/chat', authMiddleware, agentRateLimiter, chatWithAgent);

export default router;
