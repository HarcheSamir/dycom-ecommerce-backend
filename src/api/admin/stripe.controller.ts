// src/api/admin/stripe.controller.ts

import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../../index';
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

            // --- STRICT FILTER FIX ---
            // Previous logic let untagged people through.
            // This logic requires the tag to exist AND match 'dycom'.
            if (customer.metadata?.project !== 'dycom') {
               return null; 
            }
            // -------------------------

            const sub = customer.subscriptions?.data[0];
            const paymentMethod = customer.invoice_settings?.default_payment_method;

            let planDisplay = null;

            if (sub) {
                const periodEnd = sub.items?.data[0]?.current_period_end || sub.current_period_end || null;
                
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
            else {
                const charges = await stripe.charges.list({
                    customer: customer.id,
                    limit: 5, 
                });

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






/**
 * @description NEW: Get stats per closer (Count & Total Revenue) to populate the filter menu.
 */
export const getCloserStats = async (req: Request, res: Response) => {
    try {
        const stats = await prisma.transaction.groupBy({
            by: ['closer'],
            _count: { id: true },
            _sum: { amount: true },
            where: {
                closer: { not: null },
                status: 'succeeded'
            },
            orderBy: {
                _sum: { amount: 'desc' }
            }
        });

        const formatted = stats
            .filter(s => s.closer !== '' && s.closer !== null)
            .map(s => ({
                name: s.closer,
                count: s._count.id,
                total: s._sum.amount || 0
            }));

        res.status(200).json(formatted);
    } catch (error) {
        console.error('Error fetching closer stats:', error);
        res.status(500).json({ error: 'Failed to fetch closer stats.' });
    }
};

/**
 * @description Fetches raw Charges.
 * Mode A: Filter by Closer (Local DB)
 * Mode B: Search (Stripe Customer Search -> Stripe Charge Search)
 * Mode C: List (Stripe Charge List)
 */
export const getStripeTransactions = async (req: Request, res: Response) => {
    try {
        const { limit = 20, starting_after, ending_before, search, closer } = req.query;

        // --- MODE A: FILTER BY CLOSER (LOCAL DB SOURCE) ---
        if (closer) {
            const page = starting_after ? Number(starting_after) : 1;
            const take = Number(limit);
            const skip = (page - 1) * take;

            const [localTx, total] = await prisma.$transaction([
                prisma.transaction.findMany({
                    where: { closer: String(closer), status: 'succeeded' },
                    include: { user: true },
                    orderBy: { createdAt: 'desc' },
                    take,
                    skip
                }),
                prisma.transaction.count({ where: { closer: String(closer), status: 'succeeded' } })
            ]);

            const formatted = localTx.map(tx => ({
                id: tx.id, // Internal ID, technically not Stripe ID but works for UI
                paymentId: tx.stripePaymentId,
                amount: (tx.amount * 100), // Convert to cents for consistent formatting
                currency: tx.currency,
                status: tx.status,
                created: Math.floor(new Date(tx.createdAt).getTime() / 1000),
                customer: {
                    id: tx.user.stripeCustomerId || 'local',
                    email: tx.user.email,
                    name: `${tx.user.firstName} ${tx.user.lastName}`
                },
                closer: tx.closer
            }));

            return res.status(200).json({
                data: formatted,
                has_more: skip + take < total,
                first_id: null,
                last_id: (page + 1).toString() // Hack: Use page numbers as "cursors" for local mode
            });
        }

        // --- MODE B & C: STRIPE SOURCE ---
        let chargesData: Stripe.Charge[] = [];
        let hasMore = false;
        let firstId = null;
        let lastId = null;

        if (search) {
            // 1. Search Customers First (Stripe Limitation Fix)
            const customers = await stripe.customers.search({
                query: `email~"${search}" OR name~"${search}"`,
                limit: 20
            });

            if (customers.data.length === 0) {
                return res.status(200).json({ data: [], has_more: false, first_id: null, last_id: null });
            }

            // 2. Search Charges by Customer IDs using OR syntax
            const query = customers.data.map(c => `customer:"${c.id}"`).join(' OR ');
            
            const searchResult = await stripe.charges.search({
                query: query,
                limit: Number(limit),
                expand: ['data.customer', 'data.invoice'], 
            });

            chargesData = searchResult.data;
            hasMore = searchResult.has_more;
            // Search pagination uses tokens, disabling simple prev/next for search results
            firstId = null;
            lastId = null;

        } else {
            // Standard List
            const params: Stripe.ChargeListParams = {
                limit: Number(limit),
                expand: ['data.customer', 'data.invoice'], 
            };

            if (starting_after) params.starting_after = starting_after as string;
            if (ending_before) params.ending_before = ending_before as string;

            const listResult = await stripe.charges.list(params);
            
            chargesData = listResult.data;
            hasMore = listResult.has_more;
            firstId = chargesData.length > 0 ? chargesData[0].id : null;
            lastId = chargesData.length > 0 ? chargesData[chargesData.length - 1].id : null;
        }

        // --- MERGE LOGIC ---
        
        // 1. Extract IDs safely
        const paymentIntentIds = chargesData
            .map(c => {
                const pi = (c as any).payment_intent;
                return typeof pi === 'string' ? pi : pi?.id;
            })
            .filter(id => !!id) as string[];
        
        const invoiceIds = chargesData
            .map(c => {
                const inv = (c as any).invoice;
                return typeof inv === 'object' && inv ? inv.id : (typeof inv === 'string' ? inv : null);
            })
            .filter(id => !!id) as string[];

        // 2. Fetch Tags from DB
        const localTransactions = await prisma.transaction.findMany({
            where: {
                OR: [
                    { stripePaymentId: { in: paymentIntentIds } },
                    { stripeInvoiceId: { in: invoiceIds } }
                ]
            },
            select: { stripePaymentId: true, stripeInvoiceId: true, closer: true }
        });

        // 3. Map & Merge
        const formattedTransactions = chargesData.map(charge => {
            const rawCharge = charge as any; 
            const paymentId = typeof rawCharge.payment_intent === 'string' ? rawCharge.payment_intent : rawCharge.payment_intent?.id;
            const invoiceId = typeof rawCharge.invoice === 'object' && rawCharge.invoice ? rawCharge.invoice.id : (typeof rawCharge.invoice === 'string' ? rawCharge.invoice : null);

            const localMatch = localTransactions.find(t => 
                (paymentId && t.stripePaymentId === paymentId) || 
                (invoiceId && t.stripeInvoiceId === invoiceId)
            );

            let customerData = { id: '', email: null as string | null, name: null as string | null };
            
            if (rawCharge.customer && typeof rawCharge.customer === 'object' && !rawCharge.customer.deleted) {
                customerData = {
                    id: rawCharge.customer.id,
                    email: rawCharge.customer.email,
                    name: rawCharge.customer.name
                };
            } else if (typeof rawCharge.customer === 'string') {
                customerData.id = rawCharge.customer;
            }

            if (!customerData.email && rawCharge.receipt_email) {
                customerData.email = rawCharge.receipt_email;
            }

            return {
                id: charge.id, 
                paymentId: paymentId, 
                amount: charge.amount, 
                currency: charge.currency,
                status: charge.status,
                created: charge.created,
                customer: customerData,
                closer: localMatch?.closer || '' 
            };
        });

        res.status(200).json({
            data: formattedTransactions,
            has_more: hasMore,
            first_id: firstId,
            last_id: lastId
        });

    } catch (error) {
        console.error('Error fetching Stripe transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions.' });
    }
};


/**
 * @description Assigns a Closer to a payment. Creates the transaction locally if it doesn't exist.
 */
export const assignCloserToTransaction = async (req: Request, res: Response) => {
    const { 
        paymentId, 
        chargeId, 
        amount, 
        currency, 
        created, 
        customerId,
        customerEmail,
        closerName 
    } = req.body;

    const targetStripeId = paymentId || chargeId;

    if (!targetStripeId) {
        return res.status(400).json({ error: 'Transaction ID required' });
    }

    try {
        const existingTx = await prisma.transaction.findFirst({
            where: { stripePaymentId: targetStripeId }
        });

        if (existingTx) {
            const updated = await prisma.transaction.update({
                where: { id: existingTx.id },
                data: { closer: closerName }
            });
            return res.status(200).json({ message: 'Closer updated', transaction: updated });
        }

        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    { stripeCustomerId: customerId },
                    { email: customerEmail }
                ]
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'Local user not found. Cannot tag payment yet.' });
        }

        const newTx = await prisma.transaction.create({
            data: {
                userId: user.id,
                stripePaymentId: paymentId, 
                amount: amount / 100, 
                currency: currency,
                status: 'succeeded',
                createdAt: new Date(created * 1000),
                closer: closerName 
            }
        });

        return res.status(201).json({ message: 'Transaction synced and closer assigned', transaction: newTx });

    } catch (error) {
        console.error('Error assigning closer:', error);
        res.status(500).json({ error: 'Failed to assign closer.' });
    }
};