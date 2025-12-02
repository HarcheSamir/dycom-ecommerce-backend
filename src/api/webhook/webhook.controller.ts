import { Request, Response } from "express";
import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { sendPurchaseConfirmationEmail } from "../../utils/sendEmail";

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

      // === 1. ONE-TIME PAYMENT SUCCESS ===
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as any;
        const metadata = paymentIntent.metadata;

        if (metadata?.type === 'MEMBERSHIP_FULL' && metadata?.userId) {
             console.log(`--- Membership Full Payment for User ${metadata.userId} ---`);
             await prisma.user.update({
                 where: { id: metadata.userId },
                 data: {
                     subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS,
                     installmentsPaid: 1,
                     installmentsRequired: 1,
                     stripeSubscriptionId: null
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

             // --- ASYNC EMAIL (Non-blocking) ---
             prisma.user.findUnique({ where: { id: metadata.userId } })
               .then(user => {
                  if (user) {
                    sendPurchaseConfirmationEmail(
                        user.email,
                        user.firstName,
                        "Lifetime Membership (One-Time)",
                        paymentIntent.amount / 100.0,
                        paymentIntent.currency,
                        null 
                    ).catch(e => console.error("Email send failed:", e));
                  }
               });
        }
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

          // --- ASYNC EMAIL (Non-blocking) ---
          Promise.all([
            prisma.user.findUnique({ where: { id: userId } }),
            prisma.videoCourse.findUnique({ where: { id: courseId }, select: { title: true } })
          ]).then(([user, course]) => {
             if (user && course) {
                sendPurchaseConfirmationEmail(
                    user.email,
                    user.firstName,
                    `Course: ${course.title}`,
                    paymentIntent.amount / 100.0,
                    paymentIntent.currency,
                    null
                ).catch(e => console.error("Email send failed:", e));
             }
          });
        }
        break;
      }

      // === 2. SUBSCRIPTION PAYMENT SUCCESS ===
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        if (!invoice.subscription) break;

        const customerId = invoice.customer as string;
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });

        if (!user) {
          console.error(`Webhook Error: User not found for customer ID ${customerId}`);
          break;
        }

        // Record Transaction
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

        // Increment Installment Count
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { installmentsPaid: { increment: 1 } },
            select: { id: true, installmentsPaid: true, installmentsRequired: true, subscriptionStatus: true }
        });

        console.log(`--- Installment ${updatedUser.installmentsPaid}/${updatedUser.installmentsRequired} paid by User ${user.id} ---`);

        // --- ASYNC EMAIL (Non-blocking) ---
        // We do NOT await this. It runs in background.
        const installmentLabel = `Membership Installment (${updatedUser.installmentsPaid}/${updatedUser.installmentsRequired})`;
        sendPurchaseConfirmationEmail(
            user.email,
            user.firstName,
            installmentLabel,
            invoice.amount_paid / 100.0,
            invoice.currency,
            invoice.hosted_invoice_url 
        ).catch(e => console.error("Email send failed:", e));
        // ----------------------------------

        // Check for Completion (Lifetime Upgrade)
        if (updatedUser.installmentsPaid >= updatedUser.installmentsRequired && updatedUser.subscriptionStatus !== 'LIFETIME_ACCESS') {
            console.log(`!!! USER ${user.id} HAS COMPLETED PAYMENTS. UPGRADING TO LIFETIME. !!!`);
            await prisma.user.update({
                where: { id: user.id },
                data: { subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS }
            });
            try {
                await stripe.subscriptions.cancel(invoice.subscription);
                console.log(`--- Stripe Subscription ${invoice.subscription} cancelled (Goal reached) ---`);
            } catch (err) {
                console.error(`Failed to cancel subscription for user ${user.id} after completion:`, err);
            }
        }

        // Affiliate Logic
        if (user.referredById) {
             const previousTransactions = await prisma.transaction.count({
                where: { userId: user.id, status: 'succeeded' }
              });
              if (previousTransactions <= 1) {
                   await prisma.user.update({
                      where: { id: user.referredById },
                      data: { availableCourseDiscounts: { increment: 1 } }
                    });
              }
        }
        break;
      }

      // === 3. SUBSCRIPTION UPDATES ===
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (!user) break;

        // CHECK 1: LIFETIME PROTECTION
        if (user.subscriptionStatus === SubscriptionStatus.LIFETIME_ACCESS) {
             console.log(`Ignored update for Lifetime User ${user.id}`);
             break;
        }

        // CHECK 2: STALE WEBHOOK PROTECTION (THE FIX)
        if (event.type === 'customer.subscription.updated' &&
            user.stripeSubscriptionId &&
            user.stripeSubscriptionId !== subscription.id) {
            console.log(`⚠️ Ignored stale update for old subscription ${subscription.id}. User is already on ${user.stripeSubscriptionId}`);
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

      // === 4. SUBSCRIPTION DELETION ===
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (!user) break;

        // CHECK 1: LIFETIME PROTECTION
        if (user.subscriptionStatus === SubscriptionStatus.LIFETIME_ACCESS) {
            break;
        }

        // CHECK 2: STALE WEBHOOK PROTECTION (THE FIX)
        if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) {
             console.log(`⚠️ Ignored deletion of old subscription ${subscription.id}. User is currently on ${user.stripeSubscriptionId}`);
             break;
        }

        // Otherwise, it was a real cancellation
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