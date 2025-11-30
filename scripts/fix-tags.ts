// scripts/fix-tags.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

async function main() {
  console.log('--- Starting Tag Correction ---');

  // 1. Get ALL local users from your Database (The Whitelist)
  console.log('Fetching local users from database...');
  const localUsers = await prisma.user.findMany({
    select: { email: true }
  });
  
  // Normalize emails to lowercase for comparison
  const validEmails = new Set(localUsers.map(u => u.email.toLowerCase()));
  console.log(`Found ${validEmails.size} valid users in local database.`);

  // 2. Fetch ALL Stripe Customers
  console.log('Fetching Stripe customers...');
  let customers: Stripe.Customer[] = [];
  let hasMore = true;
  let lastId = undefined;

  while (hasMore) {
    const listParams: Stripe.CustomerListParams = { limit: 100 };
    if (lastId) listParams.starting_after = lastId;

    const response = await stripe.customers.list(listParams);
    customers.push(...response.data);
    
    hasMore = response.has_more;
    if (hasMore) lastId = response.data[response.data.length - 1].id;
    
    process.stdout.write(`\rFetched ${customers.length} customers...`);
  }
  console.log('\nProcessing tags...');

  // 3. Compare and Fix
  let taggedCount = 0;
  let untaggedCount = 0;
  let skippedCount = 0;

  for (const customer of customers) {
    if (!customer.email) {
        skippedCount++;
        continue;
    }

    const email = customer.email.toLowerCase();
    const currentTag = customer.metadata?.project;
    
    // Check if this Stripe customer actually belongs to this App
    const isLocalUser = validEmails.has(email);

    if (isLocalUser) {
      // It IS a Dycom user. 
      if (currentTag !== 'dycom') {
        // Tag them if they aren't tagged
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, project: 'dycom' }
        });
        console.log(`[VERIFIED] Tagged ${email}`);
        taggedCount++;
      } else {
          // Already tagged correctly
          skippedCount++;
      }
    } else {
      // It is NOT a Dycom user (belongs to your other projects). 
      if (currentTag === 'dycom') {
        // REMOVE the tag immediately
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, project: null } // Setting to null removes the key
        });
        console.log(`[CLEANED] Untagged ${email} (Not in local DB)`);
        untaggedCount++;
      } else {
          skippedCount++;
      }
    }
  }

  console.log('--- Fix Complete ---');
  console.log(`Verified/Tagged (Dycom): ${taggedCount}`);
  console.log(`Cleaned/Untagged (Other Projects): ${untaggedCount}`);
  console.log(`Skipped (No Action Needed): ${skippedCount}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });