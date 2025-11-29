//  ./src/api/webhook/webhook.controller.ts

import { Request, Response } from "express";
import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const mapStripeStatusToPrismaStatus = (stripeStatus: string): SubscriptionStatus => {
  const statusMap: { [key: string]: SubscriptionStatus } = {
    'trialing': SubscriptionStatus.TRIALING,
    'active': SubscriptionStatus.ACTIVE,
    'past_due': SubscriptionStatus.PAST_DUE,
    'canceled': SubscriptionStatus.CANCELED,
    'incomplete': SubscriptionStatus.INCOMPLETE,
    'incomplete_expired': SubscriptionStatus.CANCELED,
    'unpaid': SubscriptionStatus.CANCELED,
  };
  return statusMap[stripeStatus] || SubscriptionStatus.INCOMPLETE;
}

export const webhookController = {
  async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers["stripe-signature"];
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, process.env.STRIPE_WEBHOOK_SECRET as string);
    } catch (err: any) {
      console.error("⚠️ Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {

      // === 1. ONE-TIME PAYMENT SUCCESS (For 1x Plan or Courses) ===
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as any;
        const metadata = paymentIntent.metadata;

        // A. Handle Membership (1x Full Payment)
        if (metadata?.type === 'MEMBERSHIP_FULL' && metadata?.userId) {
             console.log(`--- Membership Full Payment for User ${metadata.userId} ---`);
             
             await prisma.user.update({
                 where: { id: metadata.userId },
                 data: {
                     subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS,
                     installmentsPaid: 1,
                     installmentsRequired: 1,
                     stripeSubscriptionId: null // No sub for one-time
                 }
             });
             
             await prisma.transaction.create({
                data: {
                    userId: metadata.userId,
                    amount: paymentIntent.amount / 100.0,
                    currency: paymentIntent.currency,
                    status: 'succeeded',
                    stripeInvoiceId: paymentIntent.id,
                },
             });
        }
        // B. Handle Course Purchase (Existing Logic)
        else if (metadata?.courseId) {
          const { userId, courseId, purchasePrice } = metadata;
          if (!userId || !courseId || !purchasePrice) break;

          await prisma.coursePurchase.create({
            data: {
              userId: userId,
              courseId: courseId,
              purchasePrice: parseFloat(purchasePrice),
            },
          });
          console.log(`--- Course ${courseId} purchased by user ${userId} ---`);

          await prisma.transaction.create({
            data: {
              userId: userId,
              amount: paymentIntent.amount / 100.0,
              currency: paymentIntent.currency,
              status: 'succeeded',
              stripeInvoiceId: paymentIntent.id,
            },
          });
        }
        break;
      }

      // === 2. SUBSCRIPTION PAYMENT SUCCESS (For 2x or 3x Plans) ===
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        // Ignore invoices for one-time payments (usually billing_reason='manual' or null subscription)
        if (!invoice.subscription) break; 
        
        const customerId = invoice.customer as string;
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        
        if (!user) {
          console.error(`Webhook Error: User not found for customer ID ${customerId}`);
          break;
        }

        // 1. Record Transaction
        await prisma.transaction.create({
          data: {
            userId: user.id,
            amount: invoice.amount_paid / 100.0,
            currency: invoice.currency,
            status: 'succeeded',
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: invoice.subscription
          },
        });

        // 2. Increment Installment Count
        // NOTE: We rely on the increment to track progress.
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { installmentsPaid: { increment: 1 } },
            select: { id: true, installmentsPaid: true, installmentsRequired: true, subscriptionStatus: true }
        });

        console.log(`--- Installment ${updatedUser.installmentsPaid}/${updatedUser.installmentsRequired} paid by User ${user.id} ---`);

        // 3. CHECK FOR COMPLETION
        // If they have paid enough installments, Grant Lifetime & Cancel Stripe
        if (updatedUser.installmentsPaid >= updatedUser.installmentsRequired && updatedUser.subscriptionStatus !== 'LIFETIME_ACCESS') {
            console.log(`!!! USER ${user.id} HAS COMPLETED PAYMENTS. UPGRADING TO LIFETIME. !!!`);
            
            // A. Update DB
            await prisma.user.update({
                where: { id: user.id },
                data: { subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS }
            });

            // B. Cancel Stripe Subscription immediately (so they aren't charged again)
            try {
                await stripe.subscriptions.cancel(invoice.subscription);
                console.log(`--- Stripe Subscription ${invoice.subscription} cancelled (Goal reached) ---`);
            } catch (err) {
                console.error(`Failed to cancel subscription for user ${user.id} after completion:`, err);
            }
        }
        
        // 4. Affiliate Logic (Existing)
        if (user.referredById) {
             const previousTransactions = await prisma.transaction.count({
                where: { userId: user.id, status: 'succeeded' }
              });
              if (previousTransactions <= 1) {
                  // ... (Existing affiliate logic remains unchanged)
                   await prisma.user.update({
                      where: { id: user.referredById },
                      data: { availableCourseDiscounts: { increment: 1 } }
                    });
                    // ... (Notification logic)
              }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (!user) break;

        // === CRITICAL SAFETY CHECK ===
        // If user is already LIFETIME, do NOT revert them to Active/Canceled based on Stripe events.
        if (user.subscriptionStatus === SubscriptionStatus.LIFETIME_ACCESS) {
             console.log(`Ignored update for Lifetime User ${user.id}`);
             break;
        }

        const subscriptionStatus = mapStripeStatusToPrismaStatus(subscription.status);
        const periodEndTimestamp = subscription.cancel_at ?? subscription.items.data[0]?.current_period_end;
        const periodEnd = periodEndTimestamp ? new Date(periodEndTimestamp * 1000) : null;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscriptionStatus,
            currentPeriodEnd: periodEnd,
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string; // Safer lookup
        
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (!user) break;

        // === THE SAFETY VALVE ===
        // We just canceled the sub because they finished paying. 
        // Stripe sends "deleted". We MUST ignore this if they are Lifetime.
        if (user.subscriptionStatus === SubscriptionStatus.LIFETIME_ACCESS) {
            console.log(`--- Safety Valve: Ignored 'subscription.deleted' for Lifetime User ${user.id} ---`);
            break;
        }

        // Otherwise, it was a real cancellation (did not pay, or manually cancelled)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: SubscriptionStatus.CANCELED,
            currentPeriodEnd: null
          },
        });
        console.log(`--- Subscription ${subscription.id} was deleted/canceled (User quit) ---`);
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
};