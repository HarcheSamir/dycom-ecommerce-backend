// src/api/payment/payment.controller.ts

import { Response } from "express";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { AuthenticatedRequest } from "../../utils/AuthRequestType";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export const paymentController = {

  // ... (keep createSubscription as is) ...
  async createSubscription(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.userId;
    const { priceId, paymentMethodId } = req.body;

    if (!priceId || !paymentMethodId) {
      return res.status(400).json({ error: 'priceId and paymentMethodId are required.' });
    }

    try {
      let user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: 'User not found.' });

      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        });
        stripeCustomerId = customer.id;
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId },
        });
      }

      await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      const price = await stripe.prices.retrieve(priceId);
      const installmentsRequired = price.metadata.installments ? parseInt(price.metadata.installments) : 1;

      console.log(`User ${userId} selecting price ${priceId}. Installments: ${installmentsRequired}`);

      if (installmentsRequired === 1) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price.unit_amount!,
          currency: price.currency,
          customer: stripeCustomerId,
          payment_method: paymentMethodId,
          confirm: true, 
          return_url: 'https://influencecontact.com/dashboard',
          metadata: {
            userId: userId,
            type: 'MEMBERSHIP_FULL',
            installmentsRequired: '1'
          }
        });

        if (paymentIntent.status === 'requires_action') {
           return res.status(200).json({
             status: 'requires_action',
             clientSecret: paymentIntent.client_secret
           });
        }

        if (paymentIntent.status === 'succeeded') {
           return res.status(200).json({ status: 'succeeded' });
        }
        
        return res.status(400).json({ error: `Payment failed with status: ${paymentIntent.status}` });
      }
      else {
        const subscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: priceId }],
          expand: ["latest_invoice.payment_intent"],
          metadata: {
             type: 'MEMBERSHIP_TRANCHE',
             userId: userId,
             installmentsRequired: installmentsRequired.toString()
          }
        });

        await prisma.user.update({
            where: { id: userId },
            data: { 
                installmentsRequired: installmentsRequired,
            }
        });

        const latestInvoice = subscription.latest_invoice as any;
        const paymentIntent = latestInvoice.payment_intent as Stripe.PaymentIntent;

        if (paymentIntent && paymentIntent.status === 'requires_action') {
          return res.status(200).json({
            status: 'requires_action',
            clientSecret: paymentIntent.client_secret,
            subscriptionId: subscription.id
          });
        } else if (subscription.status === 'active') {
          return res.status(200).json({ status: 'active', subscriptionId: subscription.id });
        } else {
          return res.status(400).json({ status: subscription.status, error: 'Subscription failed to activate.' });
        }
      }

    } catch (error: any) {
      console.error("Subscription/Payment creation failed:", error);
      res.status(500).json({ error: error.message || 'Failed to process payment.' });
    }
  },

  // ... (keep createCoursePaymentIntent as is) ...
  async createCoursePaymentIntent(req: AuthenticatedRequest, res: Response) {
    const { courseId, currency, applyAffiliateDiscount } = req.body;
    const userId = req.user!.userId;

    if (!courseId || !currency || !['eur', 'usd', 'aed'].includes(currency)) {
      return res.status(400).json({ error: 'courseId and a valid currency (eur/usd/aed) are required.' });
    }

    try {
      const course = await prisma.videoCourse.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(404).json({ error: 'Course not found.' });
      }

      let initialPrice: number | null | undefined;
      let stripePriceId: string | null | undefined;

      if (currency === 'eur') {
        initialPrice = course.priceEur;
        stripePriceId = course.stripePriceIdEur;
      } else if (currency === 'aed') {
        initialPrice = course.priceAed;
        stripePriceId = course.stripePriceIdAed;
      } else { 
        initialPrice = course.priceUsd;
        stripePriceId = course.stripePriceIdUsd;
      }

      if (initialPrice === null || initialPrice === undefined || initialPrice < 0) {
        return res.status(400).json({ error: `Course is not available for purchase in ${currency.toUpperCase()}.` });
      }

      const clientSecret = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { stripeCustomerId: true, availableCourseDiscounts: true }
        });

        if (!user || !user.stripeCustomerId) {
          throw new Error('Stripe customer not found.');
        }

        let finalPrice = initialPrice;

        if (applyAffiliateDiscount && user.availableCourseDiscounts > 0) {
          const discountSetting = await tx.setting.findUnique({
            where: { key: 'affiliateCourseDiscountPercentage' }
          });
          const discountPercentage = Number(discountSetting?.value || 0);

          if (discountPercentage > 0) {
            finalPrice = initialPrice * (1 - (discountPercentage / 100));
            await tx.user.update({
              where: { id: userId },
              data: { availableCourseDiscounts: { decrement: 1 } }
            });
          }
        }

        if (finalPrice <= 0) {
          return null; 
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(finalPrice * 100),
          currency: currency,
          customer: user.stripeCustomerId,
          metadata: { userId, courseId, purchasePrice: finalPrice.toString() }
        });

        return paymentIntent.client_secret;
      });

      if (clientSecret === null) {
        await prisma.coursePurchase.create({
          data: { userId, courseId, purchasePrice: 0 }
        });
        console.log(`--- Course ${courseId} granted for free to user ${userId} via discount ---`);
      }

      res.status(200).json({ clientSecret });

    } catch (error: any) {
      console.error("Course Payment Intent creation failed:", error);
      if (error.message === 'Stripe customer not found.') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create Payment Intent.' });
    }
  },

  // --- THE FIX IS HERE ---
  async getProductsAndPrices(req: AuthenticatedRequest, res: Response) {
    try {
      const currency = req.query.currency || 'usd'; 

      const prices = await stripe.prices.list({
        active: true,
        currency: currency as string, 
        expand: ['data.product'],
        limit: 100, // Fetch more to be safe
      });

      const latestPrices = new Map<string, Stripe.Price>();

      for (const price of prices.data) {
        const product = price.product;

        if (typeof product !== 'object' || product === null) continue;
        if ('deleted' in product && product.deleted) continue;

        const interval = price.recurring?.interval ?? 'one-time';
        // --- FIX: Include installment count in the uniqueness key ---
        const installments = price.metadata.installments || '1';
        
        // New Key Format: productID-interval-installments
        const key = `${product.id}-${interval}-${installments}`;
        
        const existingPrice = latestPrices.get(key);

        if (!existingPrice || price.created > existingPrice.created) {
          latestPrices.set(key, price);
        }
      }

      const uniqueLatestPrices = Array.from(latestPrices.values());

      const formattedPrices = uniqueLatestPrices.map(price => {
        const product = price.product as Stripe.Product; 
        return {
          id: price.id,
          name: product.name,
          description: product.description,
          price: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval,
          metadata: price.metadata 
        };
      });

      res.status(200).json(formattedPrices);
    } catch (error: any) {
      console.error("Failed to fetch products and prices from Stripe:", error);
      res.status(500).json({ error: 'Failed to fetch subscription plans.' });
    }
  },

  // ... (keep cancelSubscription as is) ...
  async cancelSubscription(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.userId;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user || !user.stripeSubscriptionId) {
        return res.status(400).json({ error: "No active subscription found for this user." });
      }

      const updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      if (updatedSubscription.cancel_at) {
        await prisma.user.update({
          where: { id: userId },
          data: { currentPeriodEnd: new Date(updatedSubscription.cancel_at * 1000) },
        });
      }

      res.status(200).json({ message: "Subscription cancellation scheduled successfully." });
    } catch (error: any) {
      console.error("Subscription cancellation failed:", error);
      res.status(500).json({ error: "Failed to schedule subscription cancellation." });
    }
  },

  // ... (keep reactivateSubscription as is) ...
  async reactivateSubscription(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.userId;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user || !user.stripeSubscriptionId) {
        return res.status(400).json({ error: "No subscription found for this user." });
      }

      const updatedSubscription: Stripe.Subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      const newPeriodEnd = updatedSubscription.items.data[0]?.current_period_end;

      if (newPeriodEnd) {
        await prisma.user.update({
          where: { id: userId },
          data: { currentPeriodEnd: new Date(newPeriodEnd * 1000) },
        });
      }

      res.status(200).json({ message: "Subscription reactivated successfully." });
    } catch (error: any) {
      console.error("Subscription reactivation failed:", error);
      res.status(500).json({ error: "Failed to reactivate subscription." });
    }
  },

};