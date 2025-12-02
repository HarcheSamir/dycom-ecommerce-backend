
// npx ts-node scripts/test-onetime-payment.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import 'dotenv/config';

// Initialize
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// Configuration
const TEST_EMAIL = `kasdirawick@gmail.com`;

/**
 * Helper to wait for DB status update via polling
 */
async function waitForLifetimeAccess(userId: string, timeoutMs = 30000) {
    const start = Date.now();
    process.stdout.write(`   Waiting for Webhook to update DB `);

    while (Date.now() - start < timeoutMs) {
        // Bypass prisma cache
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (user && user.subscriptionStatus === 'LIFETIME_ACCESS') {
            console.log(`\n   ✅ Verified: User Status is LIFETIME_ACCESS`);
            return user;
        }

        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 1000)); // Poll every 1s
    }
    console.log('');
    throw new Error(`Timeout: Database did not update to LIFETIME_ACCESS within ${timeoutMs/1000}s. Is 'stripe listen' running?`);
}

async function main() {
    console.log('\n💎 --- STARTING ONE-TIME PAYMENT TEST --- 💎');
    console.log('⚠️  Make sure your BACKEND is running and STRIPE LISTEN is active!\n');

    try {
        // 1. Find the 1-Time Plan Price ID
        console.log('1. Finding One-Time Plan Price...');
        const prices = await stripe.prices.search({
            query: "active:'true' AND metadata['installments']:'1' AND metadata['type']:'membership_tier'",
            limit: 1
        });

        if (prices.data.length === 0) {
            throw new Error("❌ No price found in Stripe with metadata { installments: '1', type: 'membership_tier' }");
        }
        const price = prices.data[0];
        console.log(`   ✅ Found Price ID: ${price.id} (${price.unit_amount! / 100} ${price.currency})`);

        // 2. Create Stripe Customer
        console.log('2. Creating Stripe Customer...');
        const customer = await stripe.customers.create({
            email: TEST_EMAIL,
            name: 'Lifetime Tester',
            metadata: { project: 'dycom' }
        });
        console.log(`   ✅ Customer Created: ${customer.id}`);

        // 3. Create Local DB User
        console.log('3. Creating Local DB User...');
        const user = await prisma.user.create({
            data: {
                email: TEST_EMAIL,
                firstName: 'Lifetime',
                lastName: 'Tester',
                password: 'password123',
                stripeCustomerId: customer.id,
                installmentsRequired: 1, // Logic for one-time
                accountType: 'USER',
                status: 'ACTIVE'
            }
        });
        console.log(`   ✅ User Created: ${user.id}`);

        // 4. Create & Confirm PaymentIntent
        // This simulates exactly what payment.controller.ts does for installmentsRequired === 1
        console.log('4. executing PaymentIntent...');
        
        // A. Create Payment Method
        const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', {
            customer: customer.id,
        });

        // B. Create & Confirm Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: price.unit_amount!,
            currency: price.currency,
            customer: customer.id,
            payment_method: paymentMethod.id,
            confirm: true,
            // Crucial: This return_url is required for automatic confirmation
            return_url: 'https://example.com/checkout/success', 
            // Crucial: Metadata triggers the webhook logic
            metadata: {
                userId: user.id,
                type: 'MEMBERSHIP_FULL',
                installmentsRequired: '1'
            }
        });

        if (paymentIntent.status === 'succeeded') {
            console.log(`   ✅ Payment Succeeded: ${paymentIntent.id}`);
        } else {
            throw new Error(`❌ Payment failed or requires action. Status: ${paymentIntent.status}`);
        }

        // 5. Verify Webhook Effect
        await waitForLifetimeAccess(user.id);

        console.log('\n🏁 TEST COMPLETE');
        console.log(`Test User Email: ${TEST_EMAIL}`);

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();