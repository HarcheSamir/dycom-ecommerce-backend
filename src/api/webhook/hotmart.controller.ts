import { Request, Response } from "express";
import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import { sendPurchaseConfirmationEmail, sendShopOrderConfirmationEmail, sendNewShopOrderAlertToAdmins } from "../../utils/sendEmail";
import { shopOrderService } from "../shop-order/shop-order.service";
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Add HOTMART_HOTTOK to your .env file later for security
const HOTMART_SECRET = process.env.HOTMART_HOTTOK;

// Shop Order Product IDs - configure these in .env after creating products in Hotmart
const SHOP_ORDER_PRODUCT_IDS = [
    process.env.HOTMART_SHOP_TIER1_PRODUCT_ID,  // Pack Starter (1-3 products) - 299€
    process.env.HOTMART_SHOP_TIER2_PRODUCT_ID   // Pack Pro (4-10 products) - 599€
].filter(Boolean);

export const hotmartController = {
    async handleWebhook(req: Request, res: Response) {
        // Hotmart v2 sends the token in header 'x-hotmart-hottok' or body 'hottok'
        const incomingToken = req.headers['x-hotmart-hottok'] || req.body.hottok;

        if (HOTMART_SECRET && incomingToken !== HOTMART_SECRET) {
            console.error("⛔ Invalid Hotmart Token");
            return res.status(401).send("Unauthorized");
        }

        const { event, data } = req.body;
        console.log(`🔥 Hotmart Event: ${event}`);

        try {
            // Check if this is a shop order payment
            const productId = data?.product?.id?.toString();
            const isShopOrderPayment = productId && SHOP_ORDER_PRODUCT_IDS.includes(productId);

            switch (event) {
                case 'PURCHASE_APPROVED':
                case 'PURCHASE_COMPLETE':
                    if (isShopOrderPayment) {
                        await handleShopOrderPayment(data);
                    } else {
                        await handleApprovedPurchase(data);
                    }
                    break;

                case 'PURCHASE_REFUNDED':
                case 'PURCHASE_CHARGEBACK':
                case 'PURCHASE_CANCELED': // Added based on your logs
                    if (isShopOrderPayment) {
                        await handleShopOrderRefund(data);
                    } else {
                        await handleRevokeAccess(data);
                    }
                    break;

                default:
                    // Ignore events like SWITCH_PLAN, BILLET_PRINTED, etc.
                    break;
            }
        } catch (error) {
            console.error("❌ Error processing Hotmart webhook:", error);
            return res.status(500).send("Internal Server Error");
        }

        return res.json({ message: "Received" });
    }
};

/**
 * Handle shop order payment approval
 */
async function handleShopOrderPayment(data: any) {
    const buyer = data.buyer;
    const purchase = data.purchase;
    const transactionCode = purchase.transaction;
    const email = buyer.email;

    console.log(`🛍️ Processing Shop Order Payment: ${email} (${transactionCode})`);

    // Find the user by email
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        console.error(`❌ No user found for shop order payment: ${email}`);
        return;
    }

    // Find the user's pending shop order (most recent draft or pending payment)
    const order = await prisma.shopOrder.findFirst({
        where: {
            userId: user.id,
            paymentStatus: 'PENDING',
            status: { in: ['DRAFT', 'PENDING_PAYMENT'] }
        },
        orderBy: { updatedAt: 'desc' }
    });

    if (!order) {
        console.error(`❌ No pending shop order found for user: ${user.id}`);
        return;
    }

    console.log(`✅ Marking shop order as paid: ${order.id}`);

    // 1. Update order payment status to PAID (required for submitOrder)
    await prisma.shopOrder.update({
        where: { id: order.id },
        data: {
            paymentStatus: 'PAID',
            hotmartTransactionCode: transactionCode,
            paidAt: new Date(),
            // DO NOT set status to SUBMITTED here yet, submitOrder will do it
        }
    });

    // 2. Log transaction
    await prisma.transaction.create({
        data: {
            userId: user.id,
            amount: purchase.price.value,
            currency: purchase.price.currency_value,
            status: 'succeeded',
            hotmartTransactionCode: transactionCode
        }
    });

    // 3. Submit Order (Creates Ticket and sets status to SUBMITTED)
    try {
        await shopOrderService.submitOrder(user.id, order.id);
    } catch (err) {
        console.error("Error submitting order in webhook:", err);
        // Don't fail the webhook, we already recorded payment
    }

    console.log(`✅ Shop order payment processed successfully for order: ${order.id}`);

    // Send confirmation email to customer
    const productName = data.product?.name || order.pricingTier;
    await sendShopOrderConfirmationEmail(
        user.email,
        user.firstName || 'Client',
        order.id,
        productName,
        purchase.price.value,
        purchase.price.currency_value || 'EUR'
    );

    // Send alert to admins
    await sendNewShopOrderAlertToAdmins(
        order.id,
        user.email,
        user.firstName || 'Client',
        productName,
        purchase.price.value,
        purchase.price.currency_value || 'EUR'
    );
}

/**
 * Handle shop order refund
 */
async function handleShopOrderRefund(data: any) {
    const transactionCode = data.purchase.transaction;

    console.log(`⚠️ Processing shop order refund: ${transactionCode}`);

    // Find the order by transaction code
    const order = await prisma.shopOrder.findFirst({
        where: { hotmartTransactionCode: transactionCode }
    });

    if (order) {
        await prisma.shopOrder.update({
            where: { id: order.id },
            data: {
                paymentStatus: 'REFUNDED',
                status: 'CANCELLED'
            }
        });
        console.log(`✅ Shop order refunded: ${order.id}`);
    }
}

async function handleApprovedPurchase(data: any) {
    // Mapping from your provided JSON structure
    const buyer = data.buyer;
    const purchase = data.purchase;

    const email = buyer.email;
    const name = buyer.name || "Member";
    const transactionCode = purchase.transaction; // e.g. HP16015479281022
    const amount = purchase.price.value; // Hotmart sends float (e.g. 1500 or 980.00)
    const currency = purchase.price.currency_value; // e.g. "BRL", "EUR"
    const phone = buyer.checkout_phone || null;

    console.log(`✅ Processing Hotmart Sale: ${email} (${transactionCode})`);

    // 1. Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        console.log(`👤 Creating new user via Hotmart: ${email}`);

        // Generate random password
        const tempPassword = Math.random().toString(36).slice(-8) + "1!";
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Name parsing
        const nameParts = name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || 'User';

        user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
                phone,
                accountType: 'USER',
                status: 'ACTIVE',
                // INSTANT LIFETIME ACCESS
                subscriptionStatus: 'LIFETIME_ACCESS',
                installmentsPaid: 1,
                installmentsRequired: 1,
                hotmartTransactionCode: transactionCode,
                // We default to 0 available discounts for new paid users unless specified
                availableCourseDiscounts: 0
            }
        });

        // Optional: Send a specific "Welcome" email with the temp password here
        // For now, the purchase confirmation is sent below.
    } else {
        console.log(`👤 Upgrading existing user: ${user.id}`);
        // If they were a lead or free user, upgrade them
        await prisma.user.update({
            where: { id: user.id },
            data: {
                subscriptionStatus: 'LIFETIME_ACCESS',
                installmentsPaid: 1,
                installmentsRequired: 1,
                hotmartTransactionCode: transactionCode
            }
        });
    }

    // 2. Log Transaction (Idempotent check)
    const existingTx = await prisma.transaction.findFirst({
        where: { hotmartTransactionCode: transactionCode }
    });

    if (!existingTx) {
        await prisma.transaction.create({
            data: {
                userId: user.id,
                amount: amount, // Store as float
                currency: currency,
                status: 'succeeded',
                hotmartTransactionCode: transactionCode
            }
        });
    }

    // 3. Send Confirmation Email
    await sendPurchaseConfirmationEmail(
        email,
        user.firstName,
        "Dycom Academie (Lifetime Access)",
        amount,
        currency,
        null // Hotmart handles invoices, or pass `purchase.sckPaymentLink` if you want
    );
}

async function handleRevokeAccess(data: any) {
    const email = data.buyer.email;
    const transactionCode = data.purchase.transaction;

    console.log(`⚠️ Revoking access for: ${email} (Tx: ${transactionCode})`);

    await prisma.user.update({
        where: { email },
        data: {
            subscriptionStatus: 'CANCELED',
            // status: 'INACTIVE' // Optional: fully lock account
        }
    });

    // Update local transaction status if you want to track refunds
    // Not strictly necessary for access control but good for analytics
}