// scripts/create-admins.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMINS_TO_ADD = [
  { 
    email: 'harchesamir007@gmail.com', 
    firstName: 'Samir', 
    lastName: 'Dev',
    password: 'password' 
  },
  { 
    email: 'Referenceweb98@gmail.com', 
    firstName: 'Owner', 
    lastName: 'Admin',
    password: 'Dycom123.@' 
  }
];

async function main() {
  console.log('--- Seeding/Upgrading Admins ---');

  for (const admin of ADMINS_TO_ADD) {
    const existingUser = await prisma.user.findUnique({
      where: { email: admin.email }
    });

    // Hash the password regardless of whether we are creating or updating
    const hashedPassword = await bcrypt.hash(admin.password, 10);

    if (existingUser) {
      // User exists -> Update Status, Type AND Password
      await prisma.user.update({
        where: { email: admin.email },
        data: { 
          accountType: 'ADMIN',
          subscriptionStatus: 'LIFETIME_ACCESS',
          password: hashedPassword // <--- THIS WAS MISSING
        }
      });
      console.log(`[UPDATED] ${admin.email} - Admin Status, Lifetime Access, and Password updated.`);
    } else {
      // User doesn't exist -> Create new Admin
      await prisma.user.create({
        data: {
          email: admin.email,
          password: hashedPassword,
          firstName: admin.firstName,
          lastName: admin.lastName,
          accountType: 'ADMIN',
          subscriptionStatus: 'LIFETIME_ACCESS'
        }
      });
      console.log(`[CREATED] ${admin.email} created as ADMIN.`);
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());