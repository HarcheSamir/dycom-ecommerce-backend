import { Response } from 'express';
import { Prisma, Language } from '@prisma/client'; // ++ THIS LINE IS THE FIX ++
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

/**
 * @description Fetches all video courses with updated progress calculation across sections.
 */
export const getAllCourses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    // --- 1. Get Filters & UI Language ---
    const { search, sortBy, language: languageFilter } = req.query as { search?: string; sortBy?: string; language?: string };
    const uiLang = req.headers['accept-language']?.split(',')[0].split('-')[0] || 'fr';

    // --- 2. Build Dynamic WHERE Clause ---
    const where: Prisma.VideoCourseWhereInput = {};

    if (search) {
      // Search overrides language filters
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    } else if (languageFilter && languageFilter !== 'ALL') {
      // Explicit language filter from UI
      where.language = languageFilter as Language;
    } else if (!languageFilter) {
      // Default: filter by UI language if no search or explicit filter is set
      const langEnum = uiLang.toUpperCase() as Language;
      if (Object.values(Language).includes(langEnum)) {
          where.language = langEnum;
      }
    }
    // If languageFilter is 'ALL', the where clause remains empty for language.

    // --- 3. Build Dynamic ORDER BY Clause ---
    let orderBy: Prisma.VideoCourseOrderByWithRelationInput = { createdAt: 'desc' }; // Default sort
    if (sortBy === 'title') {
      orderBy = { title: 'asc' };
    }

    // --- 4. Determine Currency ---
    let currency: 'eur' | 'usd' | 'aed';
    if (uiLang === 'fr') currency = 'eur';
    else if (uiLang === 'ar') currency = 'aed';
    else currency = 'usd';

    // --- 5. Execute Query ---
    const coursesFromDb = await prisma.videoCourse.findMany({
      where,
      orderBy,
      select: {
          id: true,
          title: true,
          description: true,
          coverImageUrl: true,
          order: true,
          language: true,
          priceEur: true,
          priceUsd: true,
          priceAed: true,
          sections: {
              select: {
                  _count: { select: { videos: true } }
              },
          },
      }
    });

    // --- 6. Format Response ---
    const coursesWithProgressAndPrice = coursesFromDb.map(course => {
      const totalVideos = course.sections.reduce((sum, section) => sum + section._count.videos, 0);
      const { sections, priceEur, priceUsd, priceAed, ...rest } = course;
      
      let price;
      if (currency === 'eur') price = priceEur;
      else if (currency === 'aed') price = priceAed;
      else price = priceUsd;

      return {
        ...rest,
        totalVideos,
        completedVideos: 0, // Note: Progress calculation removed for performance on main listing.
        price: price,
        currency: currency,
      };
    });

    return res.status(200).json(coursesWithProgressAndPrice);
  } catch (error) {
    console.error('Error fetching courses with progress:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};


export const getCourseById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const userId = req.user!.userId;

    const [course, user] = await Promise.all([
        prisma.videoCourse.findUnique({
            where: { id: courseId },
            include: {
                sections: {
                    orderBy: { order: 'asc' },
                    include: {
                        videos: {
                            orderBy: { order: 'asc' },
                            select: { id: true, title: true, description: true, vimeoId: true, duration: true, order: true, progress: { where: { userId } } },
                        },
                    },
                },
            },
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                subscriptionStatus: true,
                accountType: true,
                coursePurchases: { where: { courseId: courseId } }
            }
        })
    ]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const isSubscriber = user?.subscriptionStatus === 'ACTIVE';
    const hasPurchased = (user?.coursePurchases?.length ?? 0) > 0;
    const isAdmin = user?.accountType === 'ADMIN';
    
    // --- THIS IS THE FIX ---
    // Check both price fields to determine if the course is free.
    const isFreeCourse = (course.priceEur === null || course.priceEur === 0) && (course.priceUsd === null || course.priceUsd === 0);
    // --- END OF FIX ---

    const hasAccess = isAdmin || hasPurchased || (isSubscriber && isFreeCourse);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. This course must be purchased individually.' });
    }

    return res.status(200).json(course);
  } catch (error) {
    console.error('Error in getCourseById:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

/**
 * @description Updates or creates a progress record for a video.
 * (This function remains unchanged)
 */
export const updateVideoProgress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = req.user!.userId;
    const { completed } = req.body as { completed: boolean };

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'The "completed" field is required and must be a boolean.' });
    }

    const progressData = {
      userId,
      videoId,
      completed,
      completedAt: completed ? new Date() : null,
    };

    await prisma.videoProgress.upsert({
      where: { userId_videoId: { userId, videoId } },
      update: progressData,
      create: progressData,
    });

    return res.status(200).json({ message: 'Progress updated successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};