// src/api/admin/affiliate.controller.ts

import { Request, Response } from 'express';
import { prisma } from '../../index';

/**
 * @description Fetches the top 5 affiliates based on who has the most paying referrals.
 * @route GET /api/admin/affiliates/leaderboard
 */
export const getAffiliateLeaderboard = async (req: Request, res: Response) => {
    try {

        // Step 1: Find all users who have referred at least one person.
        const potentialAffiliates = await prisma.user.findMany({
            where: {
                referrals: {
                    some: { id: { not: undefined } } // Find users who appear as a referrer
                }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                _count: {
                    select: { referrals: true, } // Get total referral count
                }
            }
        });


        // Step 2: For each affiliate, calculate their score (number of paying referrals).
        const leaderboardData = await Promise.all(
            potentialAffiliates.map(async (affiliate) => {
                // This query counts how many of the affiliate's children have at least one successful transaction.
                const payingReferralsCount = await prisma.user.count({
                    where: {
                        referredById: affiliate.id,
                        transactions: {
                            some: {
                                status: 'succeeded'
                            }
                        }
                    }
                });
                

                return {
                    id: affiliate.id,
                    name: `${affiliate.firstName} ${affiliate.lastName}`,
                    email: affiliate.email,
                    totalReferrals: affiliate._count.referrals,
                    payingReferrals: payingReferralsCount,
                };
            })
        );


        // Step 3: Sort the scored data and take the top 5.
        const sortedLeaderboard = leaderboardData
            .sort((a, b) => b.payingReferrals - a.payingReferrals || b.totalReferrals - a.totalReferrals)
            .slice(0, 5);


        res.status(200).json(sortedLeaderboard);

    } catch (error) {
        console.error('--- [BACKEND DEBUG] FATAL ERROR in getAffiliateLeaderboard ---', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};