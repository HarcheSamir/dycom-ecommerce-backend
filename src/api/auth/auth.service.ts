import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendOtpEmail, sendPasswordResetEmail, sendNewUserSignupAlertToAdmins } from '../../utils/sendEmail';
import crypto from 'crypto';

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
    const { email, password, firstName, lastName, refCode, phone } = userData;


    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        accountType: 'USER',
      },
    });

    // Alert admins about new signup
    await sendNewUserSignupAlertToAdmins(
      newUser.id,
      newUser.email,
      newUser.firstName || '',
      newUser.lastName || ''
    );

    const payload = { userId: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName, accountType: newUser.accountType };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    return { user: exclude(newUser, ['password']), token };
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

    // === NEW ADMIN OTP LOGIC ===
    if (user.accountType === 'ADMIN') {
      // 1. Generate 6-digit code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

      // 2. Save to DB
      await prisma.user.update({
        where: { id: user.id },
        data: { otpCode, otpExpiresAt }
      });

      // 3. Send Email
      await sendOtpEmail(user.email, otpCode);

      // 4. Return special flag (Controller will handle this)
      return { requireOtp: true, email: user.email };
    }

    // Standard User Login (Return User object)
    return exclude(user, ['password', 'otpCode', 'otpExpiresAt']);
  },

  // === NEW VERIFICATION FUNCTION ===
  async verifyAdminOtp(data: { email: string; otp: string }) {
    const { email, otp } = data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.accountType !== 'ADMIN') {
      throw new Error('Invalid request.');
    }

    // Check if OTP matches
    if (user.otpCode !== otp) {
      throw new Error('Invalid OTP code.');
    }

    // Check if expired
    if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
      throw new Error('OTP code has expired. Please login again.');
    }

    // Success! Clear the OTP fields so it can't be reused
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpiresAt: null }
    });

    return exclude(user, ['password', 'otpCode', 'otpExpiresAt']);
  },

  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Security: Don't reveal if user exists. Return success anyway.
      return;
    }

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Save to DB
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires: tokenExpires
      }
    });

    // Send Email
    await sendPasswordResetEmail(user.email, resetToken);
  },

  // 2. PERFORM RESET
  async resetPassword(token: string, newPassword: string) {
    // Find user with this token AND ensure token hasn't expired
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { gt: new Date() } // Expires > Now
      }
    });

    if (!user) {
      throw new Error('Invalid or expired reset token.');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update User & Clear Token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    return { message: 'Password updated successfully' };
  }
};