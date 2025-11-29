 
  import { Request, Response } from 'express';
  import { prisma } from '../../index';
  import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
  
  interface SearchRequestBody {
    keyword?: string;
    country?: string;
    platform?: string; // NEW: 'instagram', 'youtube', 'tiktok'
    minFollowers?: number; // NEW: minimum follower count
    maxFollowers?: number; // NEW: maximum follower count
    page?: number;
    limit?: number;
  }
  

  
  /**
 * @description Search for content creators, now using the authenticated user's ID.
 * @route POST /api/content-creators/search
 */
export const searchContentCreators = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;

    const {
      keyword,
      country,
      platform,
      minFollowers,
      maxFollowers,
      page = 1,
      limit = 10
    } = req.body as SearchRequestBody;

    const where: Prisma.ContentCreatorWhereInput = {};

    if (country) {
      where.country = { contains: country };
    }

    if (keyword && keyword.trim() !== '') {
      where.OR = [
        { nickname: { contains: keyword } },
        { username: { contains: keyword } },
        { bio: { contains: keyword } },
        { niche: { name: { contains: keyword } } },
      ];
    }

    if (platform) {
      if (platform === 'instagram') {
        where.instagram = { not: { equals: null } };
      } else if (platform === 'youtube') {
        where.youtube = { not: { equals: null } };
      } else if (platform === 'tiktok') {
        where.profileLink = { not: undefined };
      }
    }

    if (minFollowers !== undefined || maxFollowers !== undefined) {
      where.followers = {};
      if (minFollowers !== undefined) {
        where.followers.gte = minFollowers;
      }
      if (maxFollowers !== undefined) {
        where.followers.lte = maxFollowers;
      }
    }

    const skip = (page - 1) * limit;

    // *** THIS IS THE FIX: Default sort by followers descending ***
    const [contentCreators, total] = await prisma.$transaction([
      prisma.contentCreator.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          followers: 'desc',
        },
        include: { region: true, niche: true }
      }),
      prisma.contentCreator.count({ where }),
    ]);

    if (keyword || country || platform || minFollowers || maxFollowers) {
      await prisma.searchHistory.create({
        data: {
          userId,
          keyword: keyword ?? '',
          country: country || null
        },
      });
    }

    return res.status(200).json({
      data: contentCreators,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });

  } catch (error) {
    console.error('Error searching content creators:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};



  /**
   * @description Records that an authenticated user has visited a content creator's profile.
   * @route POST /api/content-creators/:creatorId/visit
   */
  export const recordProfileVisit = async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 1. Check for authenticated user
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
      }
      const { userId } = req.user;
      const { creatorId } = req.params;
  
      // 2. Validate the creatorId
      if (!creatorId) {
          return res.status(400).json({ error: 'Content Creator ID is required.' });
      }
  
      // 3. Create the visit record in the database
      await prisma.visitedProfile.create({
        data: {
          userId,
          creatorId,
        },
      });
  
      return res.status(201).json({ message: 'Profile visit recorded successfully.' });
  
    } catch (error) {
      console.error('Error recording profile visit:', error);
      // Handle specific error, e.g., if creatorId does not exist
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
          return res.status(404).json({ error: 'Content creator not found.' });
      }
      return res.status(500).json({ error: 'An internal server error occurred.' });
    }
  };

  export const searchRegions = async (req: Request, res: Response) => {
    try {
      const regions = await prisma.region.findMany({
        select: {
          id: true,
          name: true,
          countryName: true,
          flag: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
      return res.status(200).json({ data: regions });
    } catch (error) {
      console.error('Error fetching regions:', error);
      return res.status(500).json({ error: 'An internal server error occurred.' });
    }
  }

  /**
 * @description Get a single content creator by ID.
 * @route GET /api/content-creators/:creatorId
 */
export const getCreatorById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { creatorId } = req.params;
    const creator = await prisma.contentCreator.findUnique({
      where: { id: creatorId },
      include: { region: true, niche: true },
    });

    if (!creator) {
      return res.status(404).json({ error: 'Content creator not found.' });
    }

    return res.status(200).json(creator);
  } catch (error) {
    console.error('Error fetching content creator:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};