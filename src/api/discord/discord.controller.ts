// src/api/discord/discord.controller.ts
import { Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { addUserToGuild, removeUserFromGuild } from '../../utils/discord';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;
const DISCORD_API = 'https://discord.com/api/v10';

export const discordController = {

    /**
     * GET /api/discord/auth-url
     * Returns the Discord OAuth2 authorization URL for the frontend to redirect to.
     */
    getAuthUrl(req: AuthenticatedRequest, res: Response) {
        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            redirect_uri: DISCORD_REDIRECT_URI,
            response_type: 'code',
            scope: 'identify guilds.join',
            state: 'discord_connect',
        });

        const url = `https://discord.com/oauth2/authorize?${params.toString()}`;
        res.json({ url });
    },

    /**
     * POST /api/discord/callback
     * Exchanges the authorization code for an access token, 
     * saves Discord user info, and adds user to guild.
     */
    async callback(req: AuthenticatedRequest, res: Response) {
        try {
            const { code } = req.body;

            if (!code) {
                return res.status(400).json({ message: 'Authorization code is required.' });
            }

            // 1. Exchange code for access token
            const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: DISCORD_CLIENT_ID,
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: DISCORD_REDIRECT_URI,
                }),
            });

            if (!tokenRes.ok) {
                const error = await tokenRes.text();
                console.error('[Discord] Token exchange failed:', error);
                return res.status(400).json({ message: 'Failed to exchange Discord code.' });
            }

            const tokenData = await tokenRes.json();
            const accessToken = tokenData.access_token;

            // 2. Get Discord user info
            const userRes = await fetch(`${DISCORD_API}/users/@me`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });

            if (!userRes.ok) {
                return res.status(400).json({ message: 'Failed to fetch Discord user info.' });
            }

            const discordUser = await userRes.json();
            const discordId = discordUser.id;
            const discordUsername = discordUser.username;
            const discordAvatar = discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
                : null;

            // 3. Check if this Discord account is already linked to another user
            const existingLink = await prisma.user.findUnique({
                where: { discordId },
                select: { id: true },
            });

            if (existingLink && existingLink.id !== req.user!.userId) {
                return res.status(409).json({
                    message: 'Ce compte Discord est déjà lié à un autre utilisateur.'
                });
            }

            // 4. Save Discord info to user
            await prisma.user.update({
                where: { id: req.user!.userId },
                data: {
                    discordId,
                    discordAccessToken: accessToken,
                },
            });

            // 5. Add user to guild
            const added = await addUserToGuild(discordId, accessToken);

            res.json({
                message: added ? 'Discord connecté et ajouté au serveur !' : 'Discord connecté (l\'ajout au serveur a échoué, réessayez).',
                discordId,
                discordUsername,
                discordAvatar,
            });
        } catch (error: any) {
            console.error('[Discord] Callback error:', error);
            res.status(500).json({ message: 'Erreur lors de la connexion Discord.' });
        }
    },

    /**
     * POST /api/discord/disconnect
     * Removes Discord link and kicks user from guild.
     */
    async disconnect(req: AuthenticatedRequest, res: Response) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.user!.userId },
                select: { discordId: true },
            });

            if (user?.discordId) {
                // Kick from server
                await removeUserFromGuild(user.discordId);
            }

            // Clear Discord data
            await prisma.user.update({
                where: { id: req.user!.userId },
                data: {
                    discordId: null,
                    discordAccessToken: null,
                },
            });

            res.json({ message: 'Discord déconnecté avec succès.' });
        } catch (error: any) {
            console.error('[Discord] Disconnect error:', error);
            res.status(500).json({ message: 'Erreur lors de la déconnexion Discord.' });
        }
    },
};
