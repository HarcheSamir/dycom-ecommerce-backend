// src/api/admin/stripe.controller.ts

import { Request, Response } from 'express';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * @description Fetches real-time financial stats from Stripe (Balance & High-level counts)
 */
export const getStripeFinancialStats = async (req: Request, res: Response) => {
    try {
        const balance = await stripe.balance.retrieve();
        const subscriptions = await stripe.subscriptions.list({ limit: 100, status: 'all' });

        const stats = {
            balance: {
                available: balance.available.reduce((acc, cur) => acc + cur.amount, 0) / 100,
                pending: balance.pending.reduce((acc, cur) => acc + cur.amount, 0) / 100,
                currency: balance.available[0]?.currency || 'usd'
            },
            subscribers: {
                active: subscriptions.data.filter(s => s.status === 'active').length,
                past_due: subscriptions.data.filter(s => s.status === 'past_due').length,
                canceled: subscriptions.data.filter(s => s.status === 'canceled').length,
                trialing: subscriptions.data.filter(s => s.status === 'trialing').length,
            }
        };
        res.status(200).json(stats);
    } catch (error) {
        console.error('Error fetching Stripe stats:', error);
        res.status(500).json({ error: 'Failed to fetch financial stats.' });
    }
};

/**
 * @description Fetches customers. If no subscription, checks for one-time charges (Lifetime).
 */
export const getStripeCustomers = async (req: Request, res: Response) => {
    try {
        const { limit = 20, starting_after, ending_before } = req.query;

        const params: Stripe.CustomerListParams = {
            limit: Number(limit),
            expand: [
                'data.subscriptions.data.default_payment_method',
                'data.invoice_settings.default_payment_method'
            ],
        };

        if (starting_after) params.starting_after = starting_after as string;
        if (ending_before) params.ending_before = ending_before as string;

        const customers = await stripe.customers.list(params);

        const formattedCustomers = await Promise.all(customers.data.map(async (customer: any) => {
            if (customer.deleted) return null;

            const sub = customer.subscriptions?.data[0];
            const paymentMethod = customer.invoice_settings?.default_payment_method;

            let planDisplay = null;

            // Scenario A: User is a Subscriber
            if (sub) {
                
                // Get current_period_end from the subscription item, NOT the subscription
                const periodEnd = sub.items?.data[0]?.current_period_end || null;
                
                planDisplay = {
                    type: 'subscription',
                    status: sub.status,
                    interval: sub.items?.data[0]?.price?.recurring?.interval || 'one-time',
                    amount: sub.items?.data[0]?.price?.unit_amount || 0,
                    currency: sub.items?.data[0]?.price?.currency || 'usd',
                    current_period_end: periodEnd,
                    next_billing_date: periodEnd 
                        ? new Date(periodEnd * 1000).toISOString() 
                        : null
                };
            } 
            // Scenario B: No Subscription, check for One-Time Charges (Lifetime)
            else {
                // Fetch the last 5 charges (to skip over potential failed attempts)
                const charges = await stripe.charges.list({
                    customer: customer.id,
                    limit: 5, 
                });

                // Find the first successful charge
                const successfulCharge = charges.data.find((c) => c.status === 'succeeded');

                if (successfulCharge) {
                    planDisplay = {
                        type: 'one_time',
                        status: 'succeeded',
                        interval: 'lifetime',
                        amount: successfulCharge.amount,
                        currency: successfulCharge.currency,
                        current_period_end: null 
                    };
                }
            }

            return {
                id: customer.id,
                email: customer.email,
                name: customer.name,
                balance: customer.balance,
                created: customer.created,
                currency: customer.currency,
                subscription: planDisplay,
                card: (paymentMethod && paymentMethod.card) ? {
                    brand: paymentMethod.card.brand,
                    last4: paymentMethod.card.last4,
                    exp_month: paymentMethod.card.exp_month,
                    exp_year: paymentMethod.card.exp_year
                } : null
            };
        }));

        res.status(200).json({
            data: formattedCustomers.filter(c => c !== null),
            has_more: customers.has_more,
            first_id: customers.data.length > 0 ? customers.data[0].id : null,
            last_id: customers.data.length > 0 ? customers.data[customers.data.length - 1].id : null
        });

    } catch (error) {
        console.error('Error fetching Stripe customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers.' });
    }
};