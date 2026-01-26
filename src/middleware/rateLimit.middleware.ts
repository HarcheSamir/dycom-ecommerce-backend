import rateLimit from 'express-rate-limit';
import { Request } from 'express';

export const agentRateLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10, // Limit each user to 10 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req: Request) => {
        // Use user ID (Route is authenticated, so this should always exist covers)
        return (req as any).user?.userId || 'unknown';
    },
    validate: { ip: false }, // Suppress IPv6 warning since we use User ID
    message: {
        answer: "Dylan est très sollicité. Laissez-lui le temps de souffler (Attende 30min). 🛑"
    }
});
