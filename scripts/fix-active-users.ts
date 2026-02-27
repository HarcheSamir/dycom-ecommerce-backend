//   npx ts-node scripts/fix-active-users.ts
//   Sets currentPeriodEnd = createdAt + 30 days for all ACTIVE users with no Stripe subscription

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Finding ACTIVE users with no Stripe subscription and no currentPeriodEnd...\n');

    const users = await prisma.user.findMany({
        where: {
            subscriptionStatus: 'ACTIVE',
            stripeSubscriptionId: null,
            currentPeriodEnd: null
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            installmentsPaid: true,
            installmentsRequired: true
        }
    });

    if (users.length === 0) {
        console.log('✅ No users to fix. All ACTIVE users already have currentPeriodEnd set or have Stripe.');
        return;
    }

    console.log(`Found ${users.length} users to fix:\n`);

    for (const user of users) {
        // Set currentPeriodEnd = createdAt + 30 days
        const periodEnd = new Date(user.createdAt);
        periodEnd.setDate(periodEnd.getDate() + 30);

        await prisma.user.update({
            where: { id: user.id },
            data: { currentPeriodEnd: periodEnd }
        });

        const isExpired = periodEnd < new Date();
        console.log(
            `  ${isExpired ? '⚠️' : '✅'} ${user.firstName} ${user.lastName} (${user.email})` +
            `  |  Created: ${user.createdAt.toISOString().slice(0, 10)}` +
            `  |  Period End: ${periodEnd.toISOString().slice(0, 10)}` +
            `  |  Installments: ${user.installmentsPaid}/${user.installmentsRequired}` +
            `  ${isExpired ? '← EXPIRED' : ''}`
        );
    }

    console.log(`\n✅ Done. Updated ${users.length} users.`);
    console.log('\n⚠️  Users marked EXPIRED will be auto-downgraded to PAST_DUE on their next API request.');
}

main()
    .catch(e => console.error('❌ Error:', e))
    .finally(async () => await prisma.$disconnect());
