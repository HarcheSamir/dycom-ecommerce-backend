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
        
        // We fetch a small batch just to get status counts if needed, 
        // but for high accuracy on large accounts, Reporting API is better.
        // For now, this is fast and sufficient.
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
 * @description Fetches customers using SEARCH to filter by project ('dycom').
 */
export const getStripeCustomers = async (req: Request, res: Response) => {
    try {
        const { limit = 20, starting_after } = req.query;

        // 1. USE SEARCH INSTEAD OF LIST (Filters by project tag)
        const params: Stripe.CustomerSearchParams = {
            query: "metadata['project']:'dycom'",
            limit: Number(limit),
            expand: ['data.invoice_settings.default_payment_method'],
        };

        if (starting_after) {
            params.page = starting_after as string;
        }

        const customers = await stripe.customers.search(params);

        // 2. Process in parallel
        const formattedCustomers = await Promise.all(customers.data.map(async (customer: any) => {
            if (customer.deleted) return null;

            const subId = customer.subscriptions?.data?.[0]?.id;
            const paymentMethod = customer.invoice_settings?.default_payment_method;
            let planDisplay = null;

            if (subId) {
                try {
                    // --- FIX: Cast to 'any' to bypass TS error on current_period_end ---
                    const sub: any = await stripe.subscriptions.retrieve(subId);
                    
                    planDisplay = {
                        type: 'subscription',
                        status: sub.status,
                        interval: sub.items?.data[0]?.price?.recurring?.interval || 'one-time',
                        amount: sub.items?.data[0]?.price?.unit_amount || 0,
                        currency: sub.items?.data[0]?.price?.currency || 'usd',
                        current_period_end: sub.current_period_end 
                    };
                } catch (err) { 
                    console.error(`Failed to retrieve sub ${subId}`, err); 
                }
            } else {
                // Fallback for Lifetime (One-time payments)
                const charges = await stripe.charges.list({ customer: customer.id, limit: 5 });
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
            first_id: null, 
            last_id: customers.next_page || null 
        });

    } catch (error) {
        console.error('Error fetching Stripe customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers.' });
    }
};