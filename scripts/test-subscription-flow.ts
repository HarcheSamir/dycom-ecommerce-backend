// npx ts-node scripts/test-subscription-flow.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import 'dotenv/config';

// Initialize
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// Configuration
const TEST_EMAIL = `make.brainers@gmail.com`;
const INSTALLMENTS_TARGET = 3;
const DELAY_MS = 20000; // 20 Seconds wait between jumps

/**
 * Helper to wait for DB updates via polling
 */
async function waitForInstallmentCount(userId: string, targetCount: number, timeoutMs = 90000) {
    const start = Date.now();
    process.stdout.write(`   Waiting for DB update (Target: ${targetCount}) `);
    
    while (Date.now() - start < timeoutMs) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        
        if (user && user.installmentsPaid === targetCount) {
            console.log(`\n   ✅ Verified: Installments Paid = ${user.installmentsPaid}`);
            return user;
        }
        
        // If we somehow overshot (rare but possible in race conditions)
        if (user && user.installmentsPaid > targetCount) {
            console.log(`\n   ⚠️  Overshot: Installments Paid = ${user.installmentsPaid}`);
            return user;
        }

        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
    }
    console.log('');
    throw new Error(`Timeout: Database did not update to ${targetCount} installments within ${timeoutMs/1000}s. Is 'stripe listen' running?`);
}

/**
 * Helper for delay
 */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('\n🧪 --- STARTING AUTOMATED TIME TRAVEL TEST (20s Intervals) --- 🧪');
    console.log('⚠️  Make sure your BACKEND is running and STRIPE LISTEN is active!\n');

    try {
        // 1. Find the 3-Month Plan Price ID
        console.log('1. Finding 3-Month Plan Price...');
        const prices = await stripe.prices.search({
            query: "active:'true' AND metadata['installments']:'3' AND metadata['type']:'membership_tier'",
            limit: 1
        });

        if (prices.data.length === 0) {
            throw new Error("❌ No price found in Stripe with metadata { installments: '3', type: 'membership_tier' }");
        }
        const priceId = prices.data[0].id;
        console.log(`   ✅ Found Price ID: ${priceId}`);

        // 2. Create Test Clock
        console.log('2. Creating Stripe Test Clock...');
        const now = Math.floor(Date.now() / 1000);
        const clock = await stripe.testHelpers.testClocks.create({
            frozen_time: now,
            name: `Auto Test ${new Date().toISOString()}`
        });
        console.log(`   ✅ Clock Created: ${clock.id} (Frozen at Now)`);

        // 3. Create Customer attached to Clock
        console.log('3. Creating Stripe Customer...');
        const customer = await stripe.customers.create({
            email: TEST_EMAIL,
            name: 'Time Traveler',
            test_clock: clock.id,
            payment_method: 'pm_card_visa', // Standard test card
            invoice_settings: { default_payment_method: 'pm_card_visa' },
            metadata: { project: 'dycom' }
        });
        console.log(`   ✅ Customer Created: ${customer.id}`);

        // 4. Create Local DB User
        console.log('4. Creating Local DB User...');
        const user = await prisma.user.create({
            data: {
                email: TEST_EMAIL,
                firstName: 'Time',
                lastName: 'Traveler',
                password: 'password123',
                stripeCustomerId: customer.id,
                installmentsRequired: INSTALLMENTS_TARGET,
                accountType: 'USER',
                status: 'ACTIVE'
            }
        });
        console.log(`   ✅ User Created: ${user.id}`);

        // 5. Start Subscription (Triggers Payment #1)
        console.log('5. Starting Subscription (Payment #1)...');
        const sub = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId }],
            metadata: {
                userId: user.id,
                type: 'MEMBERSHIP_TRANCHE',
                installmentsRequired: INSTALLMENTS_TARGET.toString()
            }
        });
        console.log(`   ✅ Subscription Active: ${sub.id}`);

        // Verify Payment 1
        await waitForInstallmentCount(user.id, 1);

        // --- DELAY 1 ---
        console.log(`\n⏳ Pausing for ${DELAY_MS/1000} seconds before Month 2...`);
        await sleep(DELAY_MS);

        // 6. Time Travel to Month 2
        // We use 32 days to ensure we cover any month length (28, 30, 31) and pass the billing anchor
        console.log('🚀 6. TIME TRAVEL: Advancing clock by 32 days...');
        const month2 = now + (32 * 24 * 60 * 60);
        await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: month2 });
        
        // Verify Payment 2
        await waitForInstallmentCount(user.id, 2);

        // --- DELAY 2 ---
        console.log(`\n⏳ Pausing for ${DELAY_MS/1000} seconds before Month 3...`);
        await sleep(DELAY_MS);

        // 7. Time Travel to Month 3 (Completion)
        console.log('🚀 7. TIME TRAVEL: Advancing clock by another 32 days...');
        const month3 = month2 + (32 * 24 * 60 * 60);
        await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: month3 });

        // Verify Payment 3 & Lifetime Upgrade
        const finalUser = await waitForInstallmentCount(user.id, 3);

        console.log('\n🏁 8. FINAL VERIFICATION');
        if (finalUser.subscriptionStatus === 'LIFETIME_ACCESS') {
            console.log(`   ✅ SUCCESS! User status is LIFETIME_ACCESS.`);
            console.log(`   ✅ Installments Paid: ${finalUser.installmentsPaid}/${finalUser.installmentsRequired}`);
        } else {
            console.error(`   ❌ FAILURE! User status is ${finalUser.subscriptionStatus} (Expected: LIFETIME_ACCESS)`);
        }

        // Cleanup info
        console.log(`\nTest User Email: ${TEST_EMAIL}`);
        console.log('Done.');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();