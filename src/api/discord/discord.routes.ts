// src/api/discord/discord.routes.ts
import { Router } from 'express';
import { discordController } from './discord.controller';

const router = Router();

// Get Discord OAuth2 URL
router.get('/auth-url', discordController.getAuthUrl);

// Handle OAuth2 callback (exchange code for token + add to guild)
router.post('/callback', discordController.callback);

// Disconnect Discord account
router.post('/disconnect', discordController.disconnect);

export default router;
