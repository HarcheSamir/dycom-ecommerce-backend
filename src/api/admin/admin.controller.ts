import { Request, Response } from 'express';
import { prisma } from '../../index';
import Stripe from 'stripe';
import { Language } from '@prisma/client';
import { SubscriptionStatus, CourseCategory } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sendWelcomeWithPasswordSetup, sendPurchaseConfirmationEmail } from '../../utils/sendEmail';

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
    const { title, description, coverImageUrl, priceEur, priceUsd, priceAed, language, category } = req.body;

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
                language: language && Object.values(Language).includes(language) ? language : Language.EN,
                category: category && Object.values(CourseCategory).includes(category) ? category : CourseCategory.MAIN
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
    // Added coverImageUrl to destructuring
    const { title, description, priceEur, priceUsd, priceAed, language, coverImageUrl, category } = req.body;

    try {
        const existingCourse = await prisma.videoCourse.findUnique({ where: { id: courseId as string } });
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

        // Update cover image if provided
        if (coverImageUrl) {
            prismaData.coverImageUrl = coverImageUrl;
        }

        if (category && Object.values(CourseCategory).includes(category)) {
            prismaData.category = category;
        }

        // --- Helper to handle price updates ---
        const handlePriceUpdate = async (
            newPriceVal: number | undefined,
            currentDbPriceId: string | null,
            currency: 'eur' | 'usd' | 'aed'
        ): Promise<string | null> => {
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
            where: { id: courseId as string },
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
            where: { id: courseId as string },
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
        // Find the current highest order for this course
        let newOrder = order;

        if (newOrder === undefined) {
            const lastSection = await prisma.section.findFirst({
                where: { courseId: courseId as string },
                orderBy: { order: 'desc' }
            });
            newOrder = (lastSection?.order ?? -1) + 1;
        }

        const section = await prisma.section.create({
            data: { title, order: newOrder, courseId: courseId as string },
        });
        res.status(201).json(section);
    } catch (error) {
        res.status(500).json({ error: 'Could not create section.' });
    }
};

export const addVideoToSection = async (req: Request, res: Response) => {
    const { sectionId } = req.params;
    const { title, vimeoId, duration, description, order }: { title: string; vimeoId: string; duration?: number; description?: string; order?: number } = req.body;

    if (!title || !vimeoId) {
        return res.status(400).json({ error: 'Title and vimeoId are required.' });
    }

    try {
        // Find the current highest order for this section
        let newOrder = order;

        if (newOrder === undefined) {
            const lastVideo = await prisma.video.findFirst({
                where: { sectionId: sectionId as string },
                orderBy: { order: 'desc' }
            });
            newOrder = (lastVideo?.order ?? -1) + 1;
        }

        const video = await prisma.video.create({
            data: {
                title,
                vimeoId,
                duration: duration || 0,
                description,
                order: newOrder,
                sectionId: sectionId as string
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
        await prisma.videoCourse.delete({ where: { id: courseId as string } });
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
            where: { id: sectionId as string },
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
        await prisma.section.delete({ where: { id: sectionId as string } });
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
            where: { id: videoId as string },
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
        await prisma.video.delete({ where: { id: videoId as string } });
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

        const andConditions: any[] = [];

        if (search) {
            andConditions.push({
                OR: [
                    { email: { contains: String(search) } },
                    { firstName: { contains: String(search) } },
                    { lastName: { contains: String(search) } },
                ]
            });
        }

        if (status && status !== 'ALL') {
            andConditions.push({ subscriptionStatus: String(status) });
        }

        if (installments && installments !== 'ALL') {
            if (installments === 'LIFETIME') {
                andConditions.push({ subscriptionStatus: 'LIFETIME_ACCESS' });
            } else {
                const count = Number(installments);
                andConditions.push({ installmentsRequired: count });
                andConditions.push({ subscriptionStatus: { not: 'LIFETIME_ACCESS' } });
            }
        }

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
                    status: true,
                    accountType: true,
                    subscriptionStatus: true,
                    installmentsPaid: true,
                    installmentsRequired: true,
                    createdAt: true,        // Account Creation Date
                    currentPeriodEnd: true,
                    stripeSubscriptionId: true,
                    stripeCustomerId: true,
                    referrer: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true
                        }
                    },
                    // Fetch ALL successful transactions for history & LTV
                    transactions: {
                        where: { status: 'succeeded' },
                        select: {
                            amount: true,
                            createdAt: true,
                            currency: true
                        },
                        orderBy: { createdAt: 'desc' }
                    },
                    _count: {
                        select: {
                            referrals: true,
                            coursePurchases: true,
                            searchHistory: true
                        }
                    }
                }
            }),
            prisma.user.count({ where })
        ]);

        const enrichedUsers = await Promise.all(users.map(async (user) => {
            const ltv = user.transactions.reduce((sum, tx) => sum + tx.amount, 0);

            // Map transactions to a clean history array
            const paymentHistory = user.transactions.map(tx => ({
                date: tx.createdAt,
                amount: tx.amount,
                currency: tx.currency
            }));

            return {
                ...user,
                ltv,
                paymentHistory, // <--- RETURN FULL HISTORY
                stats: {
                    referrals: user._count.referrals,
                    purchases: user._count.coursePurchases,
                    searches: user._count.searchHistory
                },
                transactions: undefined,
                _count: undefined
            };
        }));

        res.status(200).json({
            data: enrichedUsers,
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
        const user = await prisma.user.findUnique({ where: { id: userId as string } });
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
            where: { id: userId as string },
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




export const exportAdminUsers = async (req: Request, res: Response) => {
    try {
        const { search, status, installments } = req.query;

        // 1. Filtering Logic
        const andConditions: any[] = [];

        if (search) {
            andConditions.push({
                OR: [
                    { email: { contains: String(search) } },
                    { firstName: { contains: String(search) } },
                    { lastName: { contains: String(search) } },
                    { phone: { contains: String(search) } }, // Added phone to search too
                ]
            });
        }

        if (status && status !== 'ALL') {
            andConditions.push({ subscriptionStatus: String(status) });
        }

        if (installments && installments !== 'ALL') {
            if (installments === 'LIFETIME') {
                andConditions.push({ subscriptionStatus: 'LIFETIME_ACCESS' });
            } else {
                const count = Number(installments);
                andConditions.push({ installmentsRequired: count });
                andConditions.push({ subscriptionStatus: { not: 'LIFETIME_ACCESS' } });
            }
        }

        const where = andConditions.length > 0 ? { AND: andConditions } : {};

        // 2. Fetch Users + Transactions
        const users = await prisma.user.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true, // <--- ADDED THIS
                subscriptionStatus: true,
                installmentsPaid: true,
                installmentsRequired: true,
                createdAt: true,
                currentPeriodEnd: true,
                transactions: {
                    where: { status: 'succeeded' },
                    select: { amount: true, createdAt: true },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        // 3. Define CSV Headers
        const csvHeaders = [
            'ID',
            'First Name',
            'Last Name',
            'Email',
            'Phone', // <--- ADDED COLUMN HEADER
            'Status',
            'Progress (Paid)',
            'Progress (Total)',
            'LTV (EUR)',
            'Payment 1 Date',
            'Payment 2 Date',
            'Payment 3 Date',
            'Joined Date',
            'Next Billing'
        ];

        // 4. Build CSV Rows
        const headerRow = csvHeaders.join(',') + '\r\n';

        const csvRows = users.map(user => {
            const ltv = user.transactions.reduce((sum, tx) => sum + tx.amount, 0);
            const joinedDate = new Date(user.createdAt).toISOString();
            const nextBill = user.currentPeriodEnd ? new Date(user.currentPeriodEnd).toISOString() : '';

            // --- Payment Columns Logic ---
            const getPaymentInfo = (index: number) => {
                if (user.transactions[index]) {
                    return new Date(user.transactions[index].createdAt).toISOString();
                }
                if ((index + 1) <= user.installmentsRequired) {
                    return 'Pending';
                }
                return 'N/A';
            };

            const p1 = getPaymentInfo(0);
            const p2 = getPaymentInfo(1);
            const p3 = getPaymentInfo(2);

            const row = [
                user.id,
                `"${user.firstName}"`,
                `"${user.lastName}"`,
                user.email,
                user.phone || '', // <--- ADDED VALUE (Handle nulls)
                user.subscriptionStatus,
                user.installmentsPaid,
                user.installmentsRequired,
                ltv.toFixed(2),
                p1,
                p2,
                p3,
                joinedDate,
                nextBill
            ];
            return row.join(',');
        }).join('\r\n');

        const csvContent = headerRow + csvRows;

        // 5. Send Response
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="admin_users_export_${Date.now()}.csv"`);
        res.status(200).end(csvContent);

    } catch (error) {
        console.error('Error exporting users:', error);
        res.status(500).json({ error: 'Failed to export users.' });
    }
};





export const getAdminUserDetails = async (req: Request, res: Response) => {
    const { userId } = req.params;

    try {
        // 1. Fetch User with basic relations
        const user = await prisma.user.findUnique({
            where: { id: userId as string },
            include: {
                transactions: { orderBy: { createdAt: 'desc' } },
                videoProgress: { where: { completed: true } }, // Only get completed videos
                referrer: true,
                referrals: true,
            }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // 2. Fetch All Courses to calculate progress
        const allCourses = await prisma.videoCourse.findMany({
            include: {
                sections: {
                    include: {
                        videos: { select: { id: true } }
                    }
                }
            }
        });

        // 3. Calculate Progress Per Course
        const completedVideoIds = new Set(user.videoProgress.map((vp: any) => vp.videoId));

        const courseProgress = allCourses.map(course => {
            // Flatten videos in this course
            const courseVideoIds = course.sections.flatMap(s => s.videos.map(v => v.id));
            const totalVideos = courseVideoIds.length;

            if (totalVideos === 0) return null;

            const completedCount = courseVideoIds.filter(vid => completedVideoIds.has(vid)).length;
            const percentage = Math.round((completedCount / totalVideos) * 100);

            return {
                id: course.id,
                title: course.title,
                coverImageUrl: course.coverImageUrl,
                totalVideos,
                completedVideos: completedCount,
                percentage,
                status: percentage === 100 ? 'COMPLETED' : percentage > 0 ? 'IN_PROGRESS' : 'NOT_STARTED'
            };
        }).filter(c => c !== null); // Filter out empty courses

        // 4. Structure the response
        const responseData = {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                accountType: user.accountType,
                status: user.status,
                createdAt: user.createdAt,
                subscriptionStatus: user.subscriptionStatus,
                installmentsPaid: user.installmentsPaid,
                installmentsRequired: user.installmentsRequired,
                stripeCustomerId: user.stripeCustomerId,
                stripeSubscriptionId: user.stripeSubscriptionId,
                currentPeriodEnd: user.currentPeriodEnd,
            },
            financials: {
                ltv: user.transactions.filter((t: any) => t.status === 'succeeded').reduce((acc: number, curr: any) => acc + curr.amount, 0),
                transactions: user.transactions as any,
            },
            courses: courseProgress,
            affiliate: {
                referredBy: user.referrer ? `${(user.referrer as any).firstName} ${(user.referrer as any).lastName}` : null,
                referralsCount: (user as any).referrals ? (user as any).referrals.length : 0
            }
        };

        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details.' });
    }
};










/**
 * @description Manually update user subscription fields (Status, Installments).
 * Auto-extends currentPeriodEnd by 30 days when installmentsPaid increases.
 * Auto-upgrades to LIFETIME_ACCESS when installmentsPaid >= installmentsRequired.
 */
export const updateUserSubscription = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { subscriptionStatus, installmentsPaid, installmentsRequired, currentPeriodEnd } = req.body;

    try {
        const newPaid = Number(installmentsPaid);
        const newRequired = Number(installmentsRequired);

        // Fetch the current user to detect installment changes
        const currentUser = await prisma.user.findUnique({
            where: { id: userId as string },
            select: { installmentsPaid: true, stripeSubscriptionId: true, subscriptionStatus: true }
        });

        if (!currentUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Check if all installments are now complete → auto-upgrade to LIFETIME
        if (newPaid >= newRequired && newRequired > 0) {
            const updatedUser = await prisma.user.update({
                where: { id: userId as string },
                data: {
                    subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS,
                    installmentsPaid: newPaid,
                    installmentsRequired: newRequired,
                    currentPeriodEnd: null, // No expiry for lifetime
                    stripeSubscriptionId: null
                }
            });
            console.log(`✅ User ${userId} auto-upgraded to LIFETIME_ACCESS (${newPaid}/${newRequired} installments paid)`);
            return res.status(200).json(updatedUser);
        }

        // Build the update data
        const updateData: any = {
            subscriptionStatus: subscriptionStatus as SubscriptionStatus,
            installmentsPaid: newPaid,
            installmentsRequired: newRequired
        };

        // If explicitly requested by Admin UI, override the date directly
        if (currentPeriodEnd !== undefined) {
            updateData.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
            console.log(`📅 Admin manually set currentPeriodEnd to ${currentPeriodEnd} for user ${userId}`);

            // Auto-restore to ACTIVE or SMMA_ONLY if they were PAST_DUE but now have a valid date
            if (updateData.currentPeriodEnd && updateData.currentPeriodEnd > new Date() && currentUser.subscriptionStatus === 'PAST_DUE') {
                updateData.subscriptionStatus = (subscriptionStatus as SubscriptionStatus) === SubscriptionStatus.SMMA_ONLY ? SubscriptionStatus.SMMA_ONLY : SubscriptionStatus.ACTIVE;
            }
        }
        // Otherwise, run the automatic extension logic if they paid an installment manually
        else if (newPaid > currentUser.installmentsPaid && !currentUser.stripeSubscriptionId) {
            const newPeriodEnd = new Date();
            newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);
            updateData.currentPeriodEnd = newPeriodEnd;
            // If user was PAST_DUE, restore to their intended tier
            updateData.subscriptionStatus = (subscriptionStatus as SubscriptionStatus) === SubscriptionStatus.SMMA_ONLY ? SubscriptionStatus.SMMA_ONLY : SubscriptionStatus.ACTIVE;
            console.log(`📅 Auto-extended currentPeriodEnd to ${newPeriodEnd.toISOString()} for user ${userId}`);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId as string },
            data: updateData
        });
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error('Error updating user subscription manually:', error);
        res.status(500).json({ error: 'Failed to update user.' });
    }
};







/**
 * @description Syncs a user to a specific Stripe Subscription ID.
 * Verifies existence in Stripe first, checks for DB conflicts, then updates.
 */
export const syncStripeSubscription = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { stripeSubscriptionId } = req.body;

    if (!stripeSubscriptionId) {
        return res.status(400).json({ error: 'Stripe Subscription ID is required.' });
    }

    try {
        // 1. Verify with Stripe
        let subscription: any;
        try {
            subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        } catch (err) {
            return res.status(404).json({ error: 'Subscription ID not found in Stripe.' });
        }

        const customerId = subscription.customer as string;

        // 2. Check for Conflicts
        const conflictingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { stripeCustomerId: customerId },
                    { stripeSubscriptionId: subscription.id }
                ],
                NOT: { id: userId as string }
            },
            select: { email: true }
        });

        if (conflictingUser) {
            return res.status(409).json({
                error: `Conflict: This Stripe data is linked to ${conflictingUser.email}`
            });
        }

        // 3. Map Status
        const statusMap: { [key: string]: SubscriptionStatus } = {
            'trialing': 'TRIALING',
            'active': 'ACTIVE',
            'past_due': 'PAST_DUE',
            'canceled': 'CANCELED',
            'incomplete': 'INCOMPLETE',
            'incomplete_expired': 'CANCELED',
            'unpaid': 'CANCELED',
        };
        const prismaStatus = statusMap[subscription.status] || 'INCOMPLETE';

        // 4. Robust Date Parsing (Priority: Root -> Item[0])
        let rawPeriodEnd = subscription.current_period_end;

        // FIX: If missing at root, grab from the first subscription item
        if (!rawPeriodEnd && subscription.items?.data?.[0]?.current_period_end) {
            rawPeriodEnd = subscription.items.data[0].current_period_end;
        }

        const timestamp = Number(rawPeriodEnd);
        let dateObj: Date | null = null;

        // Only create Date if timestamp is valid positive number
        if (!isNaN(timestamp) && timestamp > 0) {
            dateObj = new Date(timestamp * 1000);
        }

        console.log(`[SYNC SUCCESS] User: ${userId} | Sub: ${subscription.id} | Date: ${dateObj}`);

        const updatedUser = await prisma.user.update({
            where: { id: userId as string },
            data: {
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: customerId,
                subscriptionStatus: prismaStatus,
                currentPeriodEnd: dateObj
            }
        });

        res.status(200).json({ message: 'Synced successfully', user: updatedUser });

    } catch (error) {
        console.error('Error syncing subscription:', error);
        res.status(500).json({ error: 'Failed to sync subscription.' });
    }
};





/**
 * @description Adds a transaction record based on a Stripe Payment Intent ID.
 * Useful for fixing missing transaction history.
 */
export const addStripePayment = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { stripePaymentId } = req.body;

    if (!stripePaymentId) {
        return res.status(400).json({ error: 'Stripe Payment ID (pi_...) is required.' });
    }

    try {
        // 1. Check if transaction already exists to prevent duplicates
        const existingTx = await prisma.transaction.findFirst({
            where: { stripePaymentId }
        });

        if (existingTx) {
            return res.status(409).json({ error: 'This payment ID is already recorded in the database.' });
        }

        // 2. Verify with Stripe
        let paymentIntent: any;
        try {
            paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentId);
        } catch (err) {
            console.error("Stripe Retrieve Error:", err);
            return res.status(404).json({ error: 'Payment Intent ID not found in Stripe.' });
        }

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: `Payment status is ${paymentIntent.status}, not succeeded.` });
        }

        // 3. Create Transaction
        // We handle invoice carefully: it might be a string ID, an object, or null.
        let invoiceId = null;
        if (typeof paymentIntent.invoice === 'string') {
            invoiceId = paymentIntent.invoice;
        } else if (paymentIntent.invoice && paymentIntent.invoice.id) {
            invoiceId = paymentIntent.invoice.id;
        }

        const transaction = await prisma.transaction.create({
            data: {
                userId: userId as string,
                stripePaymentId: paymentIntent.id,
                stripeInvoiceId: invoiceId,
                amount: paymentIntent.amount / 100, // Stripe is in cents
                currency: paymentIntent.currency,
                status: 'succeeded',
                createdAt: new Date(paymentIntent.created * 1000) // Ensure TS knows this is a timestamp
            }
        });

        res.status(200).json({ message: 'Payment recorded successfully', transaction });

    } catch (error) {
        console.error('Error adding payment:', error);
        res.status(500).json({ error: 'Failed to add payment.' });
    }
};







/**
 * @description Fetches users with PAST_DUE status and enriches with real-time Stripe invoice data.
 */
export const getPastDueUsers = async (req: Request, res: Response) => {
    try {
        // 1. Fetch users from DB
        const users = await prisma.user.findMany({
            where: { subscriptionStatus: 'PAST_DUE' },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                subscriptionStatus: true,
                stripeSubscriptionId: true,
                stripeCustomerId: true,
                currentPeriodEnd: true
            }
        });

        // 2. Enrich with Stripe Data (Parallel)
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            let amountDue = 0;
            let currency = 'usd';
            let daysLate = 0;
            let invoiceUrl = null;
            // FIX 1: Declare variable here so it is available in the return scope
            let failureReason: string | null = null;

            if (user.stripeSubscriptionId) {
                try {
                    // Fetch subscription and expand the latest invoice to get the amount
                    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
                        expand: ['latest_invoice.payment_intent']
                    });

                    const invoice = subscription.latest_invoice as Stripe.Invoice;
                    console.log(invoice)
                    if (invoice) {
                        amountDue = invoice.amount_due; // In cents
                        currency = invoice.currency;
                        invoiceUrl = invoice.hosted_invoice_url;

                        // FIX 2: Cast to 'any' to safely access expanded property without TS errors
                        // and assign to the outer 'failureReason' variable
                        const paymentIntent = (invoice as any).payment_intent;

                        if (paymentIntent && typeof paymentIntent === 'object') {
                            const pi = paymentIntent as Stripe.PaymentIntent;
                            if (pi.last_payment_error) {
                                failureReason = pi.last_payment_error.message || pi.last_payment_error.code || 'Payment Failed';
                            }
                        }

                        // Calculate days late
                        const created = new Date(invoice.created * 1000);
                        const now = new Date();
                        const diffTime = Math.abs(now.getTime() - created.getTime());
                        daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    }
                } catch (e) {
                    console.error(`[PAST DUE] Failed to fetch stripe details for user ${user.id}`, e);
                }
            } else if (user.currentPeriodEnd) {
                // Fallback: If no stripe ID but DB has date
                const now = new Date();
                const diffTime = Math.abs(now.getTime() - user.currentPeriodEnd.getTime());
                daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }

            return {
                id: user.id,
                email: user.email,
                name: `${user.firstName} ${user.lastName}`,
                phone: user.phone,
                subscriptionStatus: user.subscriptionStatus,
                daysLate,
                amountDue: amountDue / 100, // Convert to units
                currency,
                invoiceUrl,
                failureReason, // Now correctly defined
                stripeCustomerId: user.stripeCustomerId
            };
        }));

        res.status(200).json(enrichedUsers);
    } catch (error) {
        console.error('Error fetching past due users:', error);
        res.status(500).json({ error: 'Failed to fetch past due users.' });
    }
};

/**
 * Get unread counts for admin notification badges.
 * Returns counts for support tickets and shop orders.
 */
export const getAdminUnreadCounts = async (req: Request, res: Response) => {
    try {
        const [supportUnread, shopOrdersPending] = await prisma.$transaction([
            // Count tickets with adminUnread = true
            prisma.ticket.count({
                where: { adminUnread: true }
            }),
            // Count shop orders in SUBMITTED status that admin hasn't viewed
            prisma.shopOrder.count({
                where: {
                    status: 'SUBMITTED',
                    adminViewed: false
                }
            })
        ]);

        res.status(200).json({
            support: supportUnread,
            shopOrders: shopOrdersPending,
            total: supportUnread + shopOrdersPending
        });
    } catch (error) {
        console.error('Error fetching unread counts:', error);
        res.status(500).json({ error: 'Failed to fetch unread counts.' });
    }
};

/**
 * Manually create a user with LIFETIME_ACCESS.
 * - If user exists: Upgrade to LIFETIME + send purchase email
 * - If new: Create user + generate token + send welcome email (password setup)
 */
/**
 * Manually create a user with specified status (LIFETIME_ACCESS or ACTIVE).
 * - If user exists: Upgrade/Update status + send email
 * - If new: Create user + generate token + send welcome email (password setup)
 */
export const createUser = async (req: Request, res: Response) => {
    const { email, firstName, lastName, status, installmentsPaid, installmentsRequired, stripeSubscriptionId, stripePaymentId, currentPeriodEnd } = req.body;

    if (!email || !firstName || !lastName || !status) {
        return res.status(400).json({ error: 'Email, First Name, Last Name, and Status are required.' });
    }

    try {
        const normalizedEmail = email.toLowerCase().trim();
        let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        let isNewUser = false;

        // Valid statuses for this manual creation
        const validStatuses = ['LIFETIME', 'ACTIVE', 'SMMA'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Status must be LIFETIME, ACTIVE, or SMMA.' });
        }

        const targetStatus = status === 'LIFETIME'
            ? SubscriptionStatus.LIFETIME_ACCESS
            : status === 'SMMA'
                ? SubscriptionStatus.SMMA_ONLY
                : SubscriptionStatus.ACTIVE;

        // Prepare data based on status
        let subData: any = {};
        if (targetStatus === SubscriptionStatus.LIFETIME_ACCESS) {
            subData = {
                subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS,
                installmentsPaid: 1,
                installmentsRequired: 1,
                stripeSubscriptionId: null,
                currentPeriodEnd: null
            };
        } else if (targetStatus === SubscriptionStatus.SMMA_ONLY) {
            subData = {
                subscriptionStatus: SubscriptionStatus.SMMA_ONLY,
                installmentsPaid: Number(installmentsPaid) || 0,
                installmentsRequired: Number(installmentsRequired) || 1,
                stripeSubscriptionId: null,
                currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null
            };
        } else {
            // ACTIVE — set currentPeriodEnd to provided date or null (permanent)
            subData = {
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                installmentsPaid: Number(installmentsPaid) || 0,
                installmentsRequired: Number(installmentsRequired) || 1,
                stripeSubscriptionId: stripeSubscriptionId || null,
                currentPeriodEnd: stripeSubscriptionId ? undefined : (currentPeriodEnd ? new Date(currentPeriodEnd) : null),
            };
        }

        // Generate a fake transaction code/id for internal tracking if needed
        const transactionCode = `MANUAL_ADMIN_${Date.now()}`;

        if (!user) {
            console.log(`👤 Admin creating new ${status} user: ${normalizedEmail}`);
            isNewUser = true;

            // Generate random password (placeholder)
            const tempPassword = crypto.randomBytes(16).toString('hex');
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            // Generate permanent account setup token
            const accountSetupToken = crypto.randomBytes(32).toString('hex');

            user = await prisma.user.create({
                data: {
                    email: normalizedEmail,
                    password: hashedPassword,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    accountType: 'USER',
                    status: 'ACTIVE', // Account is active
                    ...subData,
                    hotmartTransactionCode: transactionCode,
                    accountSetupToken: accountSetupToken,
                    availableCourseDiscounts: 0
                }
            });

            // Send welcome email with password setup link
            await sendWelcomeWithPasswordSetup(normalizedEmail, firstName, accountSetupToken);

        } else {
            console.log(`👤 Admin updating existing user to ${status}: ${user.id}`);

            await prisma.user.update({
                where: { id: user.id },
                data: {
                    ...subData,
                    hotmartTransactionCode: transactionCode
                }
            });

            const productName = status === 'LIFETIME'
                ? 'Lifetime Access'
                : status === 'SMMA'
                    ? 'Formation SMMA'
                    : 'Premium Access';

            await sendPurchaseConfirmationEmail(
                normalizedEmail,
                user.firstName,
                `Dycom Academie (${productName} - Admin Grant)`,
                0,
                "EUR",
                null
            );
        }

        // --- Handle SMMA CoursePurchase record ---
        if (status === 'SMMA') {
            const courseId = process.env.HOTMART_COURSE_ID;
            if (courseId) {
                await prisma.coursePurchase.upsert({
                    where: { userId_courseId: { userId: user.id, courseId } },
                    create: { userId: user.id, courseId, purchasePrice: 0 },
                    update: {}
                });
                console.log(`📚 Admin granted SMMA course access to ${normalizedEmail}`);
            } else {
                console.warn('⚠️ HOTMART_COURSE_ID not set — skipped CoursePurchase creation');
            }
        }

        // --- Handle Transaction Recording ---
        // 1. If Stripe Payment ID provided, fetch real data
        if (stripePaymentId) {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentId);
                if (paymentIntent.status === 'succeeded') {
                    // Check existing
                    const existingTx = await prisma.transaction.findFirst({ where: { stripePaymentId } });
                    if (!existingTx) {
                        await prisma.transaction.create({
                            data: {
                                userId: user.id,
                                stripePaymentId: paymentIntent.id,
                                amount: paymentIntent.amount / 100,
                                currency: paymentIntent.currency,
                                status: 'succeeded',
                                createdAt: new Date(paymentIntent.created * 1000)
                            }
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to fetch/record stripe payment during create user:", e);
            }
        } else {
            // 2. Fallback: Log a 0 EUR manual transaction just for record keeping
            await prisma.transaction.create({
                data: {
                    userId: user.id,
                    amount: 0,
                    currency: 'EUR',
                    status: 'succeeded',
                    hotmartTransactionCode: transactionCode
                }
            });
        }

        // If Stripe Subscription ID provided, try to sync period end
        if (stripeSubscriptionId) {
            try {
                const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as any;
                if (sub) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            currentPeriodEnd: new Date(sub.current_period_end * 1000),
                            stripeCustomerId: sub.customer as string
                        }
                    });
                }
            } catch (e) {
                console.warn("Failed to sync subscription details during creation:", e);
            }
        }

        res.status(200).json({
            message: isNewUser ? 'User created and invited successfully.' : 'User updated successfully.',
            user
        });

    } catch (error) {
        console.error('Error creating/updating user:', error);
        res.status(500).json({ error: 'Failed to create user.' });
    }
};


