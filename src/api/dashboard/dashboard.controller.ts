// src/api/dashboard/dashboard.controller.ts

import { Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

/**
 * @description Fetches aggregated statistics for the main dashboard.
 * @route GET /api/dashboard/stats
 */
export const getDashboardStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // We run all queries in parallel for the best performance.
    const [totalCourses, distinctCountryRecords, totalWinningProducts, totalInfluencers] = await prisma.$transaction([
      prisma.videoCourse.count(),
      
      prisma.contentCreator.findMany({
        where: { country: { not: '' } },
        distinct: ['country'],
        select: { country: true },
      }),

      prisma.winningProduct.count(),

      // +++ THIS IS THE FIX +++
      // Add a query to count all records in the ContentCreator table.
      prisma.contentCreator.count(),
    ]);

    const countriesCovered = distinctCountryRecords.length;

    res.status(200).json({
      totalCourses,
      countriesCovered,
      totalWinningProducts,
      totalInfluencers, // <-- Return the new value
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'An internal server error occurred while fetching dashboard statistics.' });
  }
};