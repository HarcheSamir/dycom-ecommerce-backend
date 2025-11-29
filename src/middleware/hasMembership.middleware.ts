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
        select: { subscriptionStatus: true }
    });

    if (!user) {
        return res.status(403).json({ message: 'Forbidden. User not found.' });
    }

    // Grant access if:
    // 1. LIFETIME_ACCESS (Paid in full)
    // 2. ACTIVE (Paying installments correctly)
    // 3. TRIALING (If you still use trials)
    const allowedStatuses = ['ACTIVE', 'TRIALING', 'LIFETIME_ACCESS'];
    
    if (!allowedStatuses.includes(user.subscriptionStatus)) {
        return res.status(403).json({ message: 'Forbidden. Active membership required.' });
    }

    next();
};