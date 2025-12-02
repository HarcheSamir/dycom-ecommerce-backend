import { Response } from 'express';
import { Prisma, Language, SubscriptionStatus } from '@prisma/client'; // Added SubscriptionStatus
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

// ... (getAllCourses remains the same) ...
export const getAllCourses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { search, sortBy, language: languageFilter } = req.query as any;
    const uiLang = req.headers['accept-language']?.split(',')[0].split('-')[0] || 'fr';

    const where: Prisma.VideoCourseWhereInput = {};
    if (search) where.OR = [{ title: { contains: search } }, { description: { contains: search } }];
    else if (languageFilter && languageFilter !== 'ALL') where.language = languageFilter as Language;
    else if (!languageFilter) {
        const langEnum = uiLang.toUpperCase() as Language;
        if (Object.values(Language).includes(langEnum)) where.language = langEnum;
    }

    let orderBy: Prisma.VideoCourseOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'title') orderBy = { title: 'asc' };

    let currency: 'eur' | 'usd' | 'aed';
    if (uiLang === 'fr') currency = 'eur';
    else if (uiLang === 'ar') currency = 'aed';
    else currency = 'usd';

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
                  videos: {
                      select: {
                          id: true,
                          progress: {
                              where: { userId, completed: true },
                              select: { id: true }
                          }
                      }
                  }
              },
          },
      }
    });

    const coursesWithProgressAndPrice = coursesFromDb.map(course => {
      let totalVideos = 0;
      let completedVideos = 0;

      course.sections.forEach(section => {
          totalVideos += section.videos.length;
          completedVideos += section.videos.reduce((acc, video) => acc + (video.progress.length > 0 ? 1 : 0), 0);
      });

      const { sections, priceEur, priceUsd, priceAed, ...rest } = course;

      let price;
      if (currency === 'eur') price = priceEur;
      else if (currency === 'aed') price = priceAed;
      else price = priceUsd;

      return {
        ...rest,
        totalVideos,
        completedVideos,
        price: price,
        currency: currency,
      };
    });

    return res.status(200).json(coursesWithProgressAndPrice);
  } catch (error) {
    console.error('Error fetching courses:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

/**
 * @description Get Course Details. Grants access to Admins & Subscribers automatically.
 */
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
                            select: {
                                id: true,
                                title: true,
                                description: true,
                                vimeoId: true,
                                duration: true,
                                order: true,
                                progress: {
                                    where: { userId },
                                    select: {
                                        completed: true,
                                        lastPosition: true,
                                        percentage: true,
                                    }
                                }
                            },
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

    // --- ACCESS LOGIC ---
    const isAdmin = user?.accountType === 'ADMIN';
    
    // Check if user has an active membership (Active, Lifetime, or Trial)
    const isSubscriber = 
        user?.subscriptionStatus === SubscriptionStatus.ACTIVE || 
        user?.subscriptionStatus === SubscriptionStatus.LIFETIME_ACCESS || 
        user?.subscriptionStatus === SubscriptionStatus.TRIALING;

    // Check if they bought it individually (Legacy or Non-Subscribers)
    const hasPurchased = (user?.coursePurchases?.length ?? 0) > 0;

    // Check if the course is free for everyone (Price 0)
    const isGlobalFree = (course.priceEur === null || course.priceEur === 0) && (course.priceUsd === null || course.priceUsd === 0);

    // GRANT ACCESS IF ANY CONDITION IS MET
    const hasAccess = isAdmin || isSubscriber || hasPurchased || isGlobalFree;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied. Please subscribe or purchase this course.' });
    }

    return res.status(200).json(course);
  } catch (error) {
    console.error('Error in getCourseById:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

// ... (updateVideoProgress remains the same as before) ...
export const updateVideoProgress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = req.user!.userId;
    const { lastPosition, percentage } = req.body;

    const isCompleted = Number(percentage) >= 95;

    const updateData: any = {
      lastPosition: Number(lastPosition),
      percentage: Number(percentage),
    };

    if (isCompleted) {
        updateData.completed = true;
        updateData.completedAt = new Date();
    }

    const result = await prisma.videoProgress.upsert({
      where: { userId_videoId: { userId, videoId } },
      update: updateData,
      create: {
          userId,
          videoId,
          ...updateData,
          completed: isCompleted || false
      },
    });

    return res.status(200).json({ message: 'Progress saved.', data: result });
  } catch (error) {
    console.error("Update Progress Error", error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};