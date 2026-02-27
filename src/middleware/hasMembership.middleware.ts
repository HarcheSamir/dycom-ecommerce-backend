import { NextFunction, Response } from "express";
import { prisma } from "..";
import { AuthenticatedRequest } from "../utils/AuthRequestType";

export const hasMembershipMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized. Please log in.' });
    }

    // Admins always have access
    if (req.user.accountType === 'ADMIN') {
        return next();
    }

    const { userId } = req.user;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            subscriptionStatus: true,
            stripeSubscriptionId: true,
            currentPeriodEnd: true,
            email: true,
            firstName: true
        }
    });

    if (!user) {
        return res.status(403).json({ message: 'Forbidden. User not found.' });
    }

    // Grant access if:
    // 1. LIFETIME_ACCESS (Paid in full)
    // 2. ACTIVE (Paying installments correctly)
    // 3. TRIALING (If you still use trials)
    // 4. SMMA_ONLY (Access to specific course, but also needs Dashboard access)
    const allowedStatuses = ['ACTIVE', 'TRIALING', 'LIFETIME_ACCESS', 'SMMA_ONLY'];

    if (!allowedStatuses.includes(user.subscriptionStatus)) {
        return res.status(403).json({ message: 'Forbidden. Active membership required.' });
    }

    // Expiry check for non-Stripe ACTIVE/SMMA users (admin-created with manual installments)
    // If they have a currentPeriodEnd set and it has passed, auto-downgrade to PAST_DUE
    if (
        (user.subscriptionStatus === 'ACTIVE' || user.subscriptionStatus === 'SMMA_ONLY') &&
        !user.stripeSubscriptionId &&
        user.currentPeriodEnd &&
        new Date() > new Date(user.currentPeriodEnd)
    ) {
        // Auto-downgrade to PAST_DUE
        await prisma.user.update({
            where: { id: userId },
            data: { subscriptionStatus: 'PAST_DUE' }
        });

        // Fire-and-forget email notification
        try {
            const { sendInstallmentExpiredEmail } = await import('../utils/sendEmail');
            sendInstallmentExpiredEmail(user.email, user.firstName).catch(console.error);
        } catch (e) {
            console.error('Failed to send installment expired email:', e);
        }

        return res.status(403).json({ message: 'Your installment period has expired. Please pay your next installment.' });
    }

    next();
};