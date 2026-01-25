
import { Router } from 'express';
import { chatWithAgent } from './academy-agent.controller';

const router = Router();

// POST /api/academy-agent/chat
router.post('/chat', chatWithAgent);

export default router;
