//   npx ts-node scripts/fix-lifetime-users.ts
//   Finds ACTIVE/PAST_DUE users with installmentsPaid >= installmentsRequired
//   and upgrades them to LIFETIME_ACCESS.
//   Does NOT touch CANCELED users. Does NOT clear currentPeriodEnd.

import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Finding ACTIVE/PAST_DUE users with installmentsPaid >= installmentsRequired who need LIFETIME upgrade...\n');

    const users = await prisma.user.findMany({
        where: {
            installmentsRequired: { gt: 0 },
            subscriptionStatus: {
                in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
            },
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            subscriptionStatus: true,
            installmentsPaid: true,
            installmentsRequired: true,
            currentPeriodEnd: true,
        }
    });

    // Filter in JS: paid >= required
    const needsFix = users.filter(u => u.installmentsPaid >= u.installmentsRequired);

    if (needsFix.length === 0) {
        console.log('✅ No users to fix. All fully-paid ACTIVE/PAST_DUE users are already LIFETIME_ACCESS.');
        return;
    }

    console.log(`Found ${needsFix.length} users who paid in full but are still ACTIVE/PAST_DUE:\n`);

    let fixedCount = 0;
    for (const user of needsFix) {
        console.log(
            `  🔧 ${user.firstName} ${user.lastName} (${user.email})` +
            `  |  Status: ${user.subscriptionStatus}` +
            `  |  Installments: ${user.installmentsPaid}/${user.installmentsRequired}` +
            `  |  Period End: ${user.currentPeriodEnd?.toISOString().slice(0, 10) ?? 'null'}`
        );

        await prisma.user.update({
            where: { id: user.id },
            data: {
                subscriptionStatus: SubscriptionStatus.LIFETIME_ACCESS,
                // Do NOT clear currentPeriodEnd — preserve existing data
                // Do NOT clear stripeSubscriptionId — handled separately
            }
        });

        console.log(`     → Upgraded to LIFETIME_ACCESS ✅`);
        fixedCount++;
    }

    console.log(`\n✅ Done. Upgraded ${fixedCount} users to LIFETIME_ACCESS.`);
}

main()
    .catch(e => console.error('❌ Error:', e))
    .finally(async () => await prisma.$disconnect());
