// scripts/create-past-due.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import 'dotenv/config';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const randomId = Math.floor(Math.random() * 10000);
const TEST_EMAIL = `pastdue_real_${randomId}@example.com`;

async function main() {
  console.log('\n🧪 --- REAL WORLD SCENARIO: Active -> Past Due (Fixed) ---');
  console.log('⚠️  Ensure your BACKEND is running and STRIPE LISTEN is active!');

  try {
    // 1. Get Price
    const prices = await stripe.prices.list({ limit: 1, active: true });
    if (prices.data.length === 0) throw new Error("No active prices found.");
    const priceId = prices.data[0].id;

    // 2. Create Test Clock
    console.log('\nCLOCK: Creating Test Clock...');
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: `Past Due Fix ${randomId}`
    });

    // 3. Create Stripe Customer
    const customer = await stripe.customers.create({
      email: TEST_EMAIL,
      name: 'Past Due Candidate',
      test_clock: clock.id,
      metadata: { project: 'dycom' }
    });

    // 4. CREATE USER IN DB
    // FIX: Explicitly require 3 installments so the first payment doesn't trigger Lifetime
    console.log('DB: Creating User (Req: 3 installments)...');
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        firstName: 'Johnny',
        lastName: 'PastDue',
        password: 'password123',
        accountType: 'USER',
        stripeCustomerId: customer.id,
        status: 'ACTIVE',
        subscriptionStatus: 'INCOMPLETE',
        installmentsPaid: 0,     // Start at 0
        installmentsRequired: 3  // FIX: Must be > 1 to avoid immediate lifetime upgrade
      }
    });
    console.log(`   ✅ User Created: ${user.id}`);

    // 5. Attach Valid Card & Subscribe (Payment 1)
    console.log('STRIPE: paying first month...');
    const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      metadata: { userId: user.id }
    });

    // 6. Link Subscription ID in DB
    // FIX: Do NOT increment installmentsPaid here. Let the webhook do it.
    await prisma.user.update({
        where: { id: user.id },
        data: { 
            stripeSubscriptionId: subscription.id,
        }
    });
    console.log(`   ✅ Linked Sub ID. Waiting for webhook to process Payment 1...`);

    // Wait a moment for the first success webhook to process
    await new Promise(r => setTimeout(r, 4000));

    // 7. SABOTAGE: Remove Card
    console.log('\n🧨 SABOTAGE: Detaching card to force failure next month...');
    await stripe.paymentMethods.detach(paymentMethod.id);

    // 8. TIME TRAVEL
    console.log('🚀 TIME TRAVEL: Jumping 32 days into the future...');
    const advanceTo = Math.floor(Date.now() / 1000) + (32 * 24 * 60 * 60);
    await stripe.testHelpers.testClocks.advance(clock.id, {
      frozen_time: advanceTo
    });

    // 9. LISTEN FOR DB UPDATE
    console.log('\n👀 WATCHING DATABASE: Waiting for Webhook to update status to PAST_DUE...');
    
    let attempts = 0;
    const maxAttempts = 30; // Wait up to 60 seconds

    while (attempts < maxAttempts) {
        const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
        
        process.stdout.write(`   [Attempt ${attempts+1}/${maxAttempts}] Current Status: ${freshUser?.subscriptionStatus} | Paid: ${freshUser?.installmentsPaid}/3 \r`);

        if (freshUser?.subscriptionStatus === 'PAST_DUE') {
            console.log(`\n\n🎉 SUCCESS! Webhook worked.`);
            console.log(`   User ${freshUser.email} is now PAST_DUE.`);
            console.log(`   Go check the Admin Panel!`);
            return;
        }

        // If it accidentally went to lifetime, abort
        if (freshUser?.subscriptionStatus === 'LIFETIME_ACCESS') {
             console.log(`\n\n❌ FAILED: User upgraded to LIFETIME_ACCESS. Adjust installmentsRequired.`);
             return;
        }

        await new Promise(r => setTimeout(r, 2000));
        attempts++;
    }

    console.error('\n\n❌ TIMEOUT: Database status did not change to PAST_DUE.');

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();