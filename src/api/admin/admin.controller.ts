import { Request, Response } from 'express';
import { prisma } from '../../index';
import Stripe from 'stripe';
import { Language } from '@prisma/client';
import { SubscriptionStatus } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);


// --- Dashboard Stats Controller ---
export const getAdminDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      activeSubscribers,
      totalUsers,
      totalRevenue,
      totalVideos,
      totalCourses,
      totalInfluencers,
      totalProducts,
    ] = await prisma.$transaction([
      prisma.transaction.count({ where: { status: 'succeeded' } }),
      prisma.user.count(),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: 'succeeded' } }),
      prisma.video.count(),
      prisma.videoCourse.count(),
      prisma.contentCreator.count(),
      prisma.winningProduct.count(),
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyRevenueData = await prisma.transaction.groupBy({
      by: ['createdAt'],
      where: { status: 'succeeded', createdAt: { gte: sixMonthsAgo } },
      _sum: { amount: true },
      orderBy: { createdAt: 'asc' }
    });
    
    const monthlyRevenueChart = monthlyRevenueData.reduce((acc: { [key: string]: number }, item) => {
        const month = new Date(item.createdAt).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
        if (!acc[month]) acc[month] = 0;
        acc[month] += item._sum.amount || 0;
        return acc;
    }, {});

    res.status(200).json({
      activeSubscribers,
      totalUsers,
      monthlyRevenue: totalRevenue._sum.amount || 0,
      totalVideos,
      totalCourses,
      totalInfluencers,
      totalProducts,
      monthlyRevenueChart,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

// --- Course Management Controllers ---
export const createCourse = async (req: Request, res: Response) => {
  const { title, description, coverImageUrl, priceEur, priceUsd, priceAed, language } = req.body;

  if (!title || !coverImageUrl) {
    return res.status(400).json({ error: 'Title and coverImageUrl are required.' });
  }

  try {
    let stripePriceIdEur = null;
    let stripePriceIdUsd = null;
    let stripePriceIdAed = null;

    const product = await stripe.products.create({ name: title });

    // Only create Stripe Price if amount is greater than 0
    if (priceEur && Number(priceEur) > 0) {
      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(Number(priceEur) * 100),
        currency: 'eur',
      });
      stripePriceIdEur = stripePrice.id;
    }

    if (priceUsd && Number(priceUsd) > 0) {
      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(Number(priceUsd) * 100),
        currency: 'usd',
      });
      stripePriceIdUsd = stripePrice.id;
    }

    if (priceAed && Number(priceAed) > 0) {
      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(Number(priceAed) * 100),
        currency: 'aed',
      });
      stripePriceIdAed = stripePrice.id;
    }

    const course = await prisma.videoCourse.create({
      data: {
        title,
        description,
        coverImageUrl,
        // --- FIX START: Default to 0 instead of null if undefined/empty ---
        priceEur: (priceEur !== undefined && priceEur !== null && priceEur !== '') ? Number(priceEur) : 0,
        priceUsd: (priceUsd !== undefined && priceUsd !== null && priceUsd !== '') ? Number(priceUsd) : 0,
        priceAed: (priceAed !== undefined && priceAed !== null && priceAed !== '') ? Number(priceAed) : 0,
        // --- FIX END ---
        stripePriceIdEur,
        stripePriceIdUsd,
        stripePriceIdAed,
        language: language && Object.values(Language).includes(language) ? language : Language.EN
      },
    });
    res.status(201).json(course);
  } catch (error) {
    console.error("Course creation failed:", error);
    res.status(500).json({ error: 'Could not create course.' });
  }
};


export const updateCourse = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const { title, description, priceEur, priceUsd, priceAed, language } = req.body;

    try {
        const existingCourse = await prisma.videoCourse.findUnique({ where: { id: courseId } });
        if (!existingCourse) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // 1. Try to find existing Stripe Product via Prices
        let stripeProductId: string | null = null;
        try {
            if (existingCourse.stripePriceIdEur) {
                const price = await stripe.prices.retrieve(existingCourse.stripePriceIdEur);
                if (typeof price.product === 'string') stripeProductId = price.product;
                else if (typeof price.product === 'object') stripeProductId = price.product.id;
            } else if (existingCourse.stripePriceIdUsd) {
                const price = await stripe.prices.retrieve(existingCourse.stripePriceIdUsd);
                if (typeof price.product === 'string') stripeProductId = price.product;
                else if (typeof price.product === 'object') stripeProductId = price.product.id;
            } else if (existingCourse.stripePriceIdAed) {
                const price = await stripe.prices.retrieve(existingCourse.stripePriceIdAed);
                if (typeof price.product === 'string') stripeProductId = price.product;
                else if (typeof price.product === 'object') stripeProductId = price.product.id;
            }
        } catch (err) {
            console.warn(`Could not retrieve existing Stripe prices for course ${courseId}. Ignoring.`);
        }

        // 2. If no product found (Free course / Seeded data), create a NEW one.
        if (!stripeProductId) {
            console.log(`No Stripe Product found for course ${courseId}. Creating a new one...`);
            const newProduct = await stripe.products.create({ name: title || existingCourse.title });
            stripeProductId = newProduct.id;
        } else {
            // Update existing product name
            if (title && title !== existingCourse.title) {
                await stripe.products.update(stripeProductId, { name: title });
            }
        }

        const prismaData: any = { title, description, language };

        // --- Helper to handle price updates ---
        const handlePriceUpdate = async (
            newPriceVal: number | undefined,
            currentDbPriceId: string | null,
            currency: 'eur' | 'usd' | 'aed'
        ): Promise<string | null> => {
            // If new price is provided and different from existing...
            // Note: We don't have the existing amount here easily without querying DB or passing it.
            // Simplified: If passed, we assume we want to update/set it.
            
            if (newPriceVal === undefined) return currentDbPriceId; // No change requested

            // If existing price ID exists, archive it
            if (currentDbPriceId) {
                try {
                    await stripe.prices.update(currentDbPriceId, { active: false });
                } catch (e) { console.warn(`Failed to archive price ${currentDbPriceId}`, e); }
            }

            // If new price is > 0, create new price
            if (newPriceVal > 0) {
                const newPriceObj = await stripe.prices.create({
                    product: stripeProductId as string,
                    unit_amount: Math.round(newPriceVal * 100),
                    currency: currency,
                });
                return newPriceObj.id;
            }

            // If new price is 0, return null (Free)
            return null;
        };

        // 3. Process Price Updates
        // We only update if the value is explicitly provided in the request
        if (priceEur !== undefined) {
            prismaData.priceEur = Number(priceEur) || 0;
            prismaData.stripePriceIdEur = await handlePriceUpdate(Number(priceEur), existingCourse.stripePriceIdEur, 'eur');
        }
        if (priceUsd !== undefined) {
            prismaData.priceUsd = Number(priceUsd) || 0;
            prismaData.stripePriceIdUsd = await handlePriceUpdate(Number(priceUsd), existingCourse.stripePriceIdUsd, 'usd');
        }
        if (priceAed !== undefined) {
            prismaData.priceAed = Number(priceAed) || 0;
            prismaData.stripePriceIdAed = await handlePriceUpdate(Number(priceAed), existingCourse.stripePriceIdAed, 'aed');
        }

        // 4. Update Database
        const updatedCourse = await prisma.videoCourse.update({
            where: { id: courseId },
            data: prismaData,
        });

        res.status(200).json(updatedCourse);
    } catch (error) {
        console.error("Course update failed:", error);
        res.status(500).json({ error: 'Could not update course.' });
    }
};

export const getAdminCourses = async (req: Request, res: Response) => {
    try {
        const coursesFromDb = await prisma.videoCourse.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                sections: { select: { _count: { select: { videos: true } } } }
            }
        });
        const courses = coursesFromDb.map(course => {
            const totalVideos = course.sections.reduce((sum, section) => sum + section._count.videos, 0);
            const { sections, ...rest } = course;
            return { ...rest, totalVideos };
        });
        res.status(200).json(courses);
    } catch (error) {
        console.error('Error in getAdminCourses:', error);
        res.status(500).json({ error: 'Could not fetch courses.' });
    }
};

export const getCourseDetails = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    try {
        const course = await prisma.videoCourse.findUnique({
            where: { id: courseId },
            include: {
                sections: {
                    orderBy: { order: 'asc' },
                    include: { videos: { orderBy: { order: 'asc' } } }
                }
            }
        });
        if (!course) return res.status(404).json({ error: 'Course not found.' });
        res.status(200).json(course);
    } catch (error) {
        res.status(500).json({ error: 'Could not fetch course details.' });
    }
};

export const createSection = async (req: Request, res: Response) => {
  const { courseId } = req.params;
  const { title, order }: { title: string; order?: number } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  try {
    const section = await prisma.section.create({
      data: { title, order: order || 0, courseId },
    });
    res.status(201).json(section);
  } catch (error) {
    res.status(500).json({ error: 'Could not create section.' });
  }
};


export const addVideoToSection = async (req: Request, res: Response) => {
  const { sectionId } = req.params;
  // --- MODIFICATION START ---
  // Read all fields from the request body and add types
  const { title, vimeoId, duration, description, order }: { title: string; vimeoId: string; duration?: number; description?: string; order?: number } = req.body;
  // --- MODIFICATION END ---
  
  if (!title || !vimeoId) {
    return res.status(400).json({ error: 'Title and vimeoId are required.' });
  }
  try {
    const video = await prisma.video.create({
      data: {
        title,
        vimeoId,
        // --- MODIFICATION START ---
        // Use the values from the request, with fallbacks
        duration: duration || 0,
        description,
        order: order || 0,
        // --- MODIFICATION END ---
        sectionId: sectionId
      },
    });
    res.status(201).json(video);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Could not add video to section.' });
  }
};


export const deleteCourse = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    try {
        await prisma.videoCourse.delete({ where: { id: courseId } });
        res.status(204).send(); // No Content
    } catch (error) {
        res.status(500).json({ error: 'Could not delete course.' });
    }
};

export const updateSection = async (req: Request, res: Response) => {
    const { sectionId } = req.params;
    const { title, order }: { title: string; order?: number } = req.body;
    try {
        const updatedSection = await prisma.section.update({
            where: { id: sectionId },
            data: { title, order },
        });
        res.status(200).json(updatedSection);
    } catch (error) {
        res.status(500).json({ error: 'Could not update section.' });
    }
};

export const deleteSection = async (req: Request, res: Response) => {
    const { sectionId } = req.params;
    try {
        await prisma.section.delete({ where: { id: sectionId } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Could not delete section.' });
    }
};

export const updateVideo = async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const { title, vimeoId, description, duration, order }: { title: string; vimeoId: string; description?: string; duration?: number; order?: number } = req.body;
    try {
        const updatedVideo = await prisma.video.update({
            where: { id: videoId },
            data: { title, vimeoId, description, duration, order },
        });
        res.status(200).json(updatedVideo);
    } catch (error) {
        res.status(500).json({ error: 'Could not update video.' });
    }
};

export const deleteVideo = async (req: Request, res: Response) => {
    const { videoId } = req.params;
    try {
        await prisma.video.delete({ where: { id: videoId } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Could not delete video.' });
    }
};

export const updateVideoOrder = async (req: Request, res: Response) => {
    const { videos }: { videos: { id: string, order: number }[] } = req.body;

    if (!Array.isArray(videos)) {
        return res.status(400).json({ error: 'A "videos" array is required.' });
    }

    try {
        const updatePromises = videos.map(video => 
            prisma.video.update({
                where: { id: video.id },
                data: { order: video.order },
            })
        );
        
        await prisma.$transaction(updatePromises);
        res.status(200).json({ message: 'Video order updated successfully.' });

    } catch (error) {
        console.error("Error updating video order:", error);
        res.status(500).json({ error: 'Could not update video order.' });
    }
};


export const getSettings = async (req: Request, res: Response) => {
    try {
        const settings = await prisma.setting.findMany();
        const settingsObject = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {} as { [key: string]: string });
        res.status(200).json(settingsObject);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

export const updateSettings = async (req: Request, res: Response) => {
    const settingsToUpdate: { [key: string]: string } = req.body;
    try {
        const updatePromises = Object.entries(settingsToUpdate).map(([key, value]) =>
            prisma.setting.upsert({
                where: { key },
                update: { value },
                create: { key, value },
            })
        );
        await prisma.$transaction(updatePromises);
        res.status(200).json({ message: 'Settings updated successfully.' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};



// ... (Keep existing imports)

// --- MEMBERSHIP PRICING MANAGEMENT ---

/**
 * Helper to find the Membership Product ID.
 * It looks for a product containing prices with type='membership_tier'
 * OR a product named "Membership".
 */
const getMembershipProductId = async (): Promise<string> => {
    // 1. Try to find via existing prices
    const prices = await stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] });
    const membershipPrice = prices.data.find(p => p.metadata.type === 'membership_tier');
    
    if (membershipPrice && typeof membershipPrice.product === 'object') {
        return membershipPrice.product.id;
    }

    // 2. Fallback: Search by name
    const products = await stripe.products.search({ query: "name:'Membership'", limit: 1 });
    if (products.data.length > 0) {
        return products.data[0].id;
    }

    // 3. Last Resort: Create it
    const newProduct = await stripe.products.create({ name: 'Membership' });
    return newProduct.id;
};

export const getMembershipPrices = async (req: Request, res: Response) => {
    try {
        // Fetch all active prices tagged as membership_tier
        const prices = await stripe.prices.list({
            active: true,
            limit: 100,
            expand: ['data.product']
        });

        // Filter strict
        const membershipPrices = prices.data.filter(p => p.metadata.type === 'membership_tier');

        // Map to a clean structure for the frontend
        // Structure: { '1': { eur: 980, usd: 1000, aed: 3000 }, '2': { ... } }
        const grid: any = {
            '1': { eur: 0, usd: 0, aed: 0 },
            '2': { eur: 0, usd: 0, aed: 0 },
            '3': { eur: 0, usd: 0, aed: 0 },
        };

        membershipPrices.forEach(price => {
            const installments = price.metadata.installments; // "1", "2", or "3"
            const currency = price.currency.toLowerCase(); // "eur", "usd", "aed"
            const amount = (price.unit_amount || 0) / 100; // Convert cents to units

            if (grid[installments] && grid[installments][currency] !== undefined) {
                grid[installments][currency] = amount;
            }
        });

        res.status(200).json(grid);
    } catch (error) {
        console.error('Error fetching membership prices:', error);
        res.status(500).json({ error: 'Failed to fetch prices.' });
    }
};

export const updateMembershipPrices = async (req: Request, res: Response) => {
    const { pricingGrid } = req.body; 
    // Expecting: { '1': { eur: 980, usd:... }, '2': { ... }, '3': { ... } }

    try {
        const productId = await getMembershipProductId();
        
        // 1. Fetch ALL currently active membership prices to compare/archive
        const currentPrices = await stripe.prices.list({
            active: true,
            product: productId,
            limit: 100
        });

        const updates = [];

        // Loop through Installments (1, 2, 3)
        for (const installments of ['1', '2', '3']) {
            // Loop through Currencies
            for (const currency of ['eur', 'usd', 'aed']) {
                
                const newAmount = Number(pricingGrid[installments][currency]);
                if (newAmount <= 0) continue; // Skip invalid or zero prices

                // Find if this specific combo already exists in Stripe
                const existingPrice = currentPrices.data.find(p => 
                    p.currency === currency && 
                    p.metadata.installments === installments && 
                    p.metadata.type === 'membership_tier'
                );

                const currentAmount = existingPrice ? (existingPrice.unit_amount! / 100) : -1;

                // Only talk to Stripe if the price CHANGED or DOESN'T EXIST
                if (currentAmount !== newAmount) {
                    
                    // A. Create NEW Price
                    const priceData: Stripe.PriceCreateParams = {
                        product: productId,
                        currency: currency,
                        unit_amount: Math.round(newAmount * 100), // To cents
                        metadata: {
                            type: 'membership_tier',
                            installments: installments
                        }
                    };

                    // Installment 1 is One-Time. Others are Recurring Monthly.
                    if (installments === '1') {
                        priceData.recurring = undefined; // One-off
                    } else {
                        priceData.recurring = { interval: 'month' };
                    }

                    await stripe.prices.create(priceData);

                    // B. Archive OLD Price (if it existed)
                    if (existingPrice) {
                        await stripe.prices.update(existingPrice.id, { active: false });
                    }
                }
            }
        }

        res.status(200).json({ message: 'Pricing updated successfully.' });

    } catch (error) {
        console.error('Error updating membership prices:', error);
        res.status(500).json({ error: 'Failed to update prices.' });
    }
};

// ... existing imports

export const updateSectionOrder = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const { sections }: { sections: { id: string, order: number }[] } = req.body;

    if (!Array.isArray(sections)) {
        return res.status(400).json({ error: 'A "sections" array is required.' });
    }

    try {
        const updatePromises = sections.map(section =>
            prisma.section.update({
                where: { id: section.id },
                data: { order: section.order },
            })
        );

        await prisma.$transaction(updatePromises);
        res.status(200).json({ message: 'Section order updated successfully.' });
    } catch (error) {
        console.error("Error updating section order:", error);
        res.status(500).json({ error: 'Could not update section order.' });
    }
};


// src/api/admin/admin.controller.ts

export const getAdminUsers = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 20, search, status, installments } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // Use an AND array to safely combine multiple conditions
        const andConditions: any[] = [];

        // 1. Search Filter
        if (search) {
            andConditions.push({
                OR: [
                    { email: { contains: String(search) } },
                    { firstName: { contains: String(search) } },
                    { lastName: { contains: String(search) } },
                ]
            });
        }

        // 2. Status Filter
        if (status && status !== 'ALL') {
            andConditions.push({ subscriptionStatus: String(status) });
        }

        // 3. Installments/Plan Filter
        if (installments && installments !== 'ALL') {
            if (installments === 'LIFETIME') {
                // If filtering for Lifetime, we specifically look for the status
                andConditions.push({ subscriptionStatus: 'LIFETIME_ACCESS' });
            } else {
                // If filtering for 2 or 3 installments
                const count = Number(installments);
                andConditions.push({ installmentsRequired: count });
                
                // Ensure we don't accidentally pick up a weird lifetime user with 2 installments setup
                // (Though logically impossible, this keeps it clean)
                andConditions.push({ subscriptionStatus: { not: 'LIFETIME_ACCESS' } });
            }
        }

        // Construct the final where object
        const where = andConditions.length > 0 ? { AND: andConditions } : {};

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    subscriptionStatus: true,
                    installmentsPaid: true,
                    installmentsRequired: true,
                    createdAt: true,
                    stripeSubscriptionId: true,
                    stripeCustomerId: true,
                }
            }),
            prisma.user.count({ where })
        ]);

        res.status(200).json({
            data: users,
            meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
};

export const grantLifetimeAccess = async (req: Request, res: Response) => {
    const { userId } = req.params;

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // 1. If they have an active Stripe Subscription, CANCEL IT immediately
        // so they don't get charged again (since we are giving them lifetime).
        if (user.stripeSubscriptionId) {
            try {
                await stripe.subscriptions.cancel(user.stripeSubscriptionId);
                console.log(`Cancelled subscription ${user.stripeSubscriptionId} for user ${userId} (Granting Lifetime)`);
            } catch (err) {
                console.warn("Could not cancel stripe sub (might be already cancelled):", err);
            }
        }

        // 2. Update Database to Lifetime
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS,
                installmentsPaid: 1,      // Visual override
                installmentsRequired: 1,  // Visual override
                stripeSubscriptionId: null, // Clear link to recurring sub
                currentPeriodEnd: null,   // No expiry
            }
        });

        res.status(200).json({ message: 'User granted Lifetime Access.', user: updatedUser });

    } catch (error) {
        console.error('Error granting lifetime access:', error);
        res.status(500).json({ error: 'Failed to update user.' });
    }
};