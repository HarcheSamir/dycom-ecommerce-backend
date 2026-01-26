import { Response } from 'express';
import { Prisma, Language, SubscriptionStatus } from '@prisma/client'; // Added SubscriptionStatus
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';

export const getAllCourses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { search, sortBy, language: languageFilter } = req.query as any;
    const uiLang = req.headers['accept-language']?.split(',')[0].split('-')[0] || 'fr';

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true }
    });
    if (!user) return res.status(404).json({ error: "User not found" });

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
        category: true,
        priceEur: true,
        priceUsd: true,
        priceAed: true,
        createdAt: true,
        seenBy: { where: { userId }, select: { id: true } },
        sections: {
          select: {
            createdAt: true, // Needed for bubble-up check
            seenBy: { where: { userId }, select: { id: true } }, // Needed for bubble-up check
            videos: {
              select: {
                id: true,
                createdAt: true, // Needed for bubble-up check
                progress: {
                  where: { userId, completed: true }, // Logic: if completed=true, it's not "new"
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
      let hasInternalNewContent = false; // Flag for badge

      course.sections.forEach(section => {
        totalVideos += section.videos.length;
        completedVideos += section.videos.reduce((acc, video) => acc + (video.progress.length > 0 ? 1 : 0), 0);

        // Check internal new content (Bubble up logic)
        // 1. Is Section New?
        const isSectionNew = (new Date(section.createdAt) > new Date(user.createdAt)) && section.seenBy.length === 0;

        // 2. Is any Video New?
        const hasNewVideo = section.videos.some(video => {
          return (new Date(video.createdAt) > new Date(user.createdAt)) && video.progress.length === 0;
        });

        if (isSectionNew || hasNewVideo) {
          hasInternalNewContent = true;
        }
      });

      const { sections, priceEur, priceUsd, priceAed, ...rest } = course;

      let price;
      if (currency === 'eur') price = priceEur;
      else if (currency === 'aed') price = priceAed;
      else price = priceUsd;

      const hasSeenCourse = course.seenBy.length > 0;
      const isNew = (new Date(course.createdAt) > new Date(user.createdAt)) && !hasSeenCourse;

      return {
        ...rest,
        totalVideos,
        completedVideos,
        price: price,
        currency: currency,
        isNew,
        hasNewContent: hasInternalNewContent, // New flag
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

    // Fetch Course with Sections, Videos, and User Progress/Seen data
    const [course, user] = await Promise.all([
      prisma.videoCourse.findUnique({
        where: { id: courseId as string },
        include: {
          sections: {
            orderBy: { order: 'asc' },
            include: {
              seenBy: { where: { userId }, select: { id: true } }, // Check if section seen
              videos: {
                orderBy: { order: 'asc' },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  vimeoId: true,
                  duration: true,
                  order: true,
                  createdAt: true, // Needed for new check
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
          createdAt: true, // User join date
          subscriptionStatus: true,
          accountType: true,
          coursePurchases: { where: { courseId: courseId as string } }
        }
      })
    ]);

    if (!course || !user) {
      return res.status(404).json({ error: 'Course or User not found.' });
    }

    // --- ACCESS LOGIC ---
    const isAdmin = user.accountType === 'ADMIN';
    const isSubscriber =
      user.subscriptionStatus === SubscriptionStatus.ACTIVE ||
      user.subscriptionStatus === SubscriptionStatus.LIFETIME_ACCESS ||
      user.subscriptionStatus === SubscriptionStatus.TRIALING;
    const hasPurchased = (user.coursePurchases?.length ?? 0) > 0;
    const isGlobalFree = (course.priceEur === null || course.priceEur === 0) && (course.priceUsd === null || course.priceUsd === 0);

    const hasAccess = isAdmin || isSubscriber || hasPurchased || isGlobalFree;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // --- NEW CONTENT LOGIC ---
    // Rule: Content is "New" if created AFTER user joined AND not yet seen.
    const userJoinDate = new Date(user.createdAt);

    const enrichedCourse = {
      ...course,
      sections: course.sections.map((section: any) => {
        const hasSeenSection = section.seenBy.length > 0;
        // A section is new if created after user joined AND user hasn't expanded it yet
        const isNewSection = (new Date(section.createdAt) > userJoinDate) && !hasSeenSection;

        const enrichedVideos = section.videos.map((video: any) => {
          const hasStartedVideo = video.progress.length > 0;
          // A video is new if created after user joined AND user hasn't watched/started it
          const isNewVideo = (new Date(video.createdAt) > userJoinDate) && !hasStartedVideo;
          return { ...video, isNew: isNewVideo };
        });

        return {
          ...section,
          seenBy: undefined, // Cleanup
          isNew: isNewSection,
          videos: enrichedVideos
        };
      })
    };

    return res.status(200).json(enrichedCourse);
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
      where: { userId_videoId: { userId, videoId: videoId as string } },
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




export const getLatestUpdates = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Fetch NEW VIDEOS, NEW MODULES, and NEW COURSES
    const [newVideos, newSections, newCourses] = await prisma.$transaction([
      prisma.video.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        where: { createdAt: { gt: user.createdAt } },
        include: { section: { include: { course: true } } }
      }),
      prisma.section.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        where: { createdAt: { gt: user.createdAt } },
        include: { course: true }
      }),
      // --- NEW QUERY FOR COURSES ---
      prisma.videoCourse.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        where: { createdAt: { gt: user.createdAt } }
      })
    ]);

    // Combine and sort
    const updates = [
      ...newVideos.map(v => ({
        type: 'VIDEO',
        id: v.id,
        title: v.title,
        courseTitle: v.section.course.title,
        date: v.createdAt,
        link: `/dashboard/training/${v.section.course.id}?video=${v.id}`
      })),
      ...newSections.map(s => ({
        type: 'MODULE',
        id: s.id,
        title: s.title,
        courseTitle: s.course.title,
        date: s.createdAt,
        link: `/dashboard/training/${s.course.id}`
      })),
      // --- MAP COURSES ---
      ...newCourses.map(c => ({
        type: 'COURSE',
        id: c.id,
        title: c.title,
        courseTitle: 'Nouvelle Formation', // Label context
        date: c.createdAt,
        link: `/dashboard/training/${c.id}`
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.status(200).json(updates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch updates" });
  }
};


export const markSectionAsSeen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sectionId } = req.params;
    const userId = req.user!.userId;

    await prisma.userSeenSection.upsert({
      where: { userId_sectionId: { userId, sectionId: sectionId as string } },
      update: {},
      create: { userId, sectionId: sectionId as string }
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    // FIX: If it fails because it already exists (P2002), that's fine. Treat as success.
    if (error.code === 'P2002') {
      return res.status(200).json({ success: true });
    }
    console.error("Mark section seen error", error);
    res.status(500).json({ error: "Failed to mark section as seen" });
  }
};

export const markCourseAsSeen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { courseId } = req.params;
    const userId = req.user!.userId;

    await prisma.userSeenCourse.upsert({
      where: { userId_courseId: { userId, courseId: courseId as string } },
      update: {},
      create: { userId, courseId: courseId as string }
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    // FIX: Handle race condition here too
    if (error.code === 'P2002') {
      return res.status(200).json({ success: true });
    }
    console.error("Mark course seen error", error);
    res.status(500).json({ error: "Failed to mark course as seen" });
  }
};