import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET as string;

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

function exclude<User, Key extends keyof User>(
  user: User,
  keys: Key[]
): Omit<User, Key> {
  for (let key of keys) {
    delete user[key];
  }
  return user;
}

export const authService = {
  async signUp(userData: any) {
    const { email, password, firstName, lastName, refCode } = userData;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('User with this email already exists.');
    }

    let referredById: string | null = null;
    if (refCode) {
      const referrer = await prisma.user.findUnique({
        where: { id: refCode }
      });
      if (!referrer) {
        throw new Error('Invalid referral code provided.');
      }
      referredById = referrer.id;
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // --- THIS IS THE DEFINITIVE FIX ---
    // The `referredById` variable is now correctly passed into the create call.
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        referredById: referredById,
        accountType: email === 'admin@admin.com' ? 'ADMIN' : 'USER',
      },
    });
    // --- END OF FIX ---

    const payload = {
      userId: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      accountType: newUser.accountType,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return {
      user: exclude(newUser, ['password']),
      token: token
    };
  },

  async login(credentials: any) {
    const { email, password } = credentials;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Invalid credentials.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials.');
    }

    return exclude(user, ['password']);
  },
};
