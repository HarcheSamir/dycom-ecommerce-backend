import { Response } from 'express';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import { prisma } from '../../index';

export const getAffiliateDashboard = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const transactionCount = await prisma.transaction.count({
            where: { userId: userId, status: 'succeeded' }
        });

        // The user must be a paying customer to access affiliate features.
        if (transactionCount === 0) {
            return res.status(403).json({ message: 'Affiliate features are unlocked after your first successful payment.' });
        }

        const [user, discountPercentageSetting] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    availableCourseDiscounts: true,
                    referrals: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            createdAt: true,
                            _count: {
                                select: { transactions: { where: { status: 'succeeded' } } }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            }),
            prisma.setting.findUnique({
                where: { key: 'affiliateCourseDiscountPercentage' }
            })
        ]);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const discountPercentage = Number(discountPercentageSetting?.value) || 50; // Default to 50%
        const referralLink = `${user.id}`; // The referral code is simply the user's ID

        const referredUsersList = user.referrals.map(ref => ({
            id: ref.id,
            name: `${ref.firstName} ${ref.lastName}`,
            signedUpAt: ref.createdAt,
            hasPaid: ref._count.transactions > 0,
        }));

        const paidReferralsCount = referredUsersList.filter(u => u.hasPaid).length;

        res.status(200).json({
            referralLink,
            discountPercentage,
            stats: {
                totalReferrals: referredUsersList.length,
                paidReferrals: paidReferralsCount,
                availableDiscounts: user.availableCourseDiscounts,
            },
            referredUsers: referredUsersList,
        });
    } catch (error) {
        console.error('Error fetching affiliate dashboard:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};