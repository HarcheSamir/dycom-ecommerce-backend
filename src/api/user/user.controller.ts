import { Request, Response } from 'express';
import { prisma } from './../../index';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import Stripe from "stripe";
import { SubscriptionStatus } from '@prisma/client'; // Import Enum

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export const getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;

    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        accountType: true,
        createdAt: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        installmentsPaid: true,       // <--- Return these to frontend
        installmentsRequired: true,   // <---
        coursePurchases: { select: { courseId: true } },
        availableCourseDiscounts: true,
        searchHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        visitedProfiles: {
          orderBy: { visitedAt: 'desc' },
          take: 5,
          select: {
            visitedAt: true,
            creator: {
              select: {
                id: true,
                nickname: true,
                username: true,
                profileLink: true,
                instagram: true,
                country: true,
                region: true,
                youtube: true,
                followers: true,
              },
            },
          },
        },
      },
    });

    if (!userProfile) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let isCancellationScheduled = false;
    let planDetails = null;

    // === CONDITION: Only fetch Stripe details if NOT Lifetime and has ID ===
    if (userProfile.subscriptionStatus !== SubscriptionStatus.LIFETIME_ACCESS && userProfile.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(userProfile.stripeSubscriptionId, {
          expand: ['items.data.price.product']
        });
        isCancellationScheduled = subscription.cancel_at_period_end;

        if (subscription.items.data.length > 0) {
          const price = subscription.items.data[0].price;
          const product = price.product as Stripe.Product;
          planDetails = {
            name: product.name,
            amount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring?.interval
          };
        }
      } catch (stripeError) {
        console.error("Could not fetch subscription from Stripe (likely canceled/expired):", stripeError);
        // It's okay to fail here, we just don't show plan details
      }
    } else if (userProfile.subscriptionStatus === SubscriptionStatus.LIFETIME_ACCESS) {
      // Hardcode display for Lifetime
      planDetails = {
        name: "Lifetime Membership",
        amount: 0,
        currency: "eur",
        interval: "one-time"
      };
    }

    const totalSearchCount = await prisma.searchHistory.count({
      where: { userId: userId },
    });

    // Logic for "Has Paid" includes Lifetime
    const isPayingMember =
      userProfile.subscriptionStatus === 'ACTIVE' ||
      userProfile.subscriptionStatus === 'TRIALING' ||
      userProfile.subscriptionStatus === 'LIFETIME_ACCESS';

    const responseData: any = {
      ...userProfile,
      isCancellationScheduled,
      planDetails,
      hasPaid: isPayingMember,
      totalSearchCount,
      visitedProfiles: userProfile.visitedProfiles,
      totalVisitsCount: userProfile.visitedProfiles.length,
      // Helper for UI progress bar (e.g., "Payment 1 of 3")
      progress: {
        paid: userProfile.installmentsPaid,
        total: userProfile.installmentsRequired
      }
    };

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

// ... (Rest of user.controller.ts remains the same)
export const updatePassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Check for authenticated user
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.body;

    // 2. Input Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both currentPassword and newPassword are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    // 3. Fetch the user with their current password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // 4. Verify the current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      // Use a generic error message for security
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 5. Hash the new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // 6. Update the user's password in the database
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
      },
    });

    return res.status(200).json({ message: 'Password updated successfully.' });

  } catch (error) {
    console.error('Error updating password:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

/**
 * @description Fetches the most recent notifications for the authenticated user.
 * @route GET /api/profile/notifications
 */
export const getUserNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 7, // Fetch the 7 most recent notifications
    });

    return res.status(200).json(notifications);

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};

export const updateUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Check for authenticated user
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const { userId } = req.user;
    const { firstName, lastName, phone } = req.body;

    // 2. Input Validation
    if (!firstName || !lastName || firstName.trim() === '' || lastName.trim() === '') {
      return res.status(400).json({ error: 'First name and last name are required.' });
    }

    // 3. Update the user's profile in the database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone ? phone.trim() : null,

      },
      // Select the fields to return, excluding the password
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        accountType: true,
        createdAt: true,
      }
    });

    return res.status(200).json(updatedUser);

  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
};