// src/utils/discord.ts
import { prisma } from '../index';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!;

const DISCORD_API = 'https://discord.com/api/v10';

// Active statuses — user stays in the Discord server
const ACTIVE_STATUSES = ['ACTIVE', 'TRIALING', 'LIFETIME_ACCESS', 'SMMA_ONLY'];

/**
 * Add a user to the Discord guild using their OAuth2 access token.
 * The bot must have the `CREATE_INSTANT_INVITE` and `MANAGE_GUILD` scope,
 * and the OAuth2 token must have the `guilds.join` scope.
 */
export async function addUserToGuild(discordId: string, accessToken: string): Promise<boolean> {
    try {
        const res = await fetch(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${discordId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                access_token: accessToken,
            }),
        });

        // 201 = added, 204 = already a member
        if (res.status === 201 || res.status === 204) {
            console.log(`[Discord] User ${discordId} added to guild successfully (status: ${res.status})`);
            return true;
        }

        const error = await res.text();
        console.error(`[Discord] Failed to add user ${discordId} to guild:`, res.status, error);
        return false;
    } catch (error) {
        console.error(`[Discord] Error adding user ${discordId} to guild:`, error);
        return false;
    }
}

/**
 * Remove (kick) a user from the Discord guild using the bot token.
 */
export async function removeUserFromGuild(discordId: string): Promise<boolean> {
    try {
        const res = await fetch(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${discordId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
            },
        });

        // 204 = success, 404 = already not in guild
        if (res.status === 204 || res.status === 404) {
            console.log(`[Discord] User ${discordId} removed from guild (status: ${res.status})`);
            return true;
        }

        const error = await res.text();
        console.error(`[Discord] Failed to remove user ${discordId} from guild:`, res.status, error);
        return false;
    } catch (error) {
        console.error(`[Discord] Error removing user ${discordId} from guild:`, error);
        return false;
    }
}

/**
 * Called whenever a user's subscription status changes.
 * If the new status is not in the active list, kick the user from Discord.
 * This is fire-and-forget — errors are logged but don't break the calling flow.
 */
export async function handleSubscriptionChange(userId: string, newStatus: string): Promise<void> {
    try {
        // If the status is still active, do nothing
        if (ACTIVE_STATUSES.includes(newStatus)) {
            return;
        }

        // Fetch the user's Discord ID
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { discordId: true },
        });

        if (!user?.discordId) {
            return; // User has no Discord linked, nothing to do
        }

        console.log(`[Discord] Subscription changed to ${newStatus} for user ${userId}, removing from guild...`);
        await removeUserFromGuild(user.discordId);
    } catch (error) {
        console.error(`[Discord] Error handling subscription change for user ${userId}:`, error);
    }
}

/**
 * Check if a user is still a member of the Discord guild.
 * If they left manually, clear their discordId and token from the DB.
 * Fire-and-forget — errors are silently logged.
 */
export async function syncDiscordMembership(userId: string, discordId: string): Promise<boolean> {
    try {
        const res = await fetch(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${discordId}`, {
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
            },
        });

        if (res.ok) {
            return true; // Still in the guild
        }

        if (res.status === 404) {
            // User left the server — clear their Discord link
            console.log(`[Discord] User ${userId} (${discordId}) is no longer in the guild, clearing link...`);
            await prisma.user.update({
                where: { id: userId },
                data: { discordId: null, discordAccessToken: null },
            });
            return false;
        }

        // Other errors (rate limit, etc.) — don't clear, just log
        console.warn(`[Discord] Guild membership check for ${discordId} returned ${res.status}`);
        return true; // Assume still connected to avoid false unlinks
    } catch (error) {
        console.error(`[Discord] Error checking guild membership for ${discordId}:`, error);
        return true; // Assume still connected on network errors
    }
}
