
import { Router } from 'express';
import { chatWithAgent, getAgentHistory } from './academy-agent.controller';

const router = Router();

import { authMiddleware } from '../../middleware/auth.middleware';
import { agentRateLimiter } from '../../middleware/rateLimit.middleware';

// POST /api/academy-agent/chat
router.post('/chat', authMiddleware, agentRateLimiter, chatWithAgent);

// GET /api/academy-agent/history
router.get('/history', authMiddleware, getAgentHistory);

export default router;
