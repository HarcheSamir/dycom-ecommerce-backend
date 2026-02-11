//   npx ts-node scripts/impersonate.ts harchesamir007@gmail.com

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

async function main() {
    // 1. Get email from command line argument
    const targetEmail = process.argv[2];

    if (!targetEmail) {
        console.error("❌ Please provide an email address.");
        console.log("Usage: npx ts-node scripts/impersonate.ts user@email.com");
        process.exit(1);
    }

    // 2. Find the user
    const user = await prisma.user.findUnique({
        where: { email: targetEmail }
    });

    if (!user) {
        console.error(`❌ User not found: ${targetEmail}`);
        process.exit(1);
    }

    // 3. Create the Payload (Must match auth.controller.ts)
    const payload = {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        accountType: user.accountType,
    };

    // 4. Sign the Token
    if (!JWT_SECRET) throw new Error("No JWT_SECRET found in .env");
    
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    console.log(`\n✅ Generated Magic Token for ${user.firstName} ${user.lastName}`);
    console.log(`\nCopy the command below and paste it into your Browser Console (F12):\n`);
    console.log(`localStorage.setItem('authToken', '${token}'); window.location.href = '/dashboard';`);
    console.log(`\n`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());