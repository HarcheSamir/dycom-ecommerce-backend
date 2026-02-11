import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting timestamp fix...');

    // Fetch all tickets with their messages
    const tickets = await prisma.ticket.findMany({
        include: {
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });

    console.log(`Found ${tickets.length} tickets to check.`);

    let updatedCount = 0;

    for (const ticket of tickets) {
        // Determine the "real" last activity time
        // 1. If messages exist, use the latest message time
        // 2. If no messages, fallback to ticket creation time
        // 3. (Optional) Could also compare with 'updatedAt' but we suspect 'updatedAt' is corrupted (too new)

        let realLastActivity = ticket.createdAt;

        if (ticket.messages && ticket.messages.length > 0) {
            realLastActivity = ticket.messages[0].createdAt;
        }

        // Check if current updatedAt is significantly different (e.g., > 1 minute later than real activity)
        // This suggests it was updated by a "read" action or similar non-content update
        const timeDiff = Math.abs(ticket.updatedAt.getTime() - realLastActivity.getTime());

        // If difference is greater than 5 seconds, we consider it "drifted" / "corrupted" by a view action
        if (timeDiff > 5000) {
            console.log(`Fixing Ticket ${ticket.id.slice(0, 8)}...`);
            console.log(`  Current UpdatedAt: ${ticket.updatedAt.toISOString()}`);
            console.log(`  Real Last Activity: ${realLastActivity.toISOString()}`);

            await prisma.ticket.update({
                where: { id: ticket.id },
                data: {
                    updatedAt: realLastActivity
                }
            });
            updatedCount++;
        }
    }

    console.log(`Finished. Fixed ${updatedCount} tickets.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
