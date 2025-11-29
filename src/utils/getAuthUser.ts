import { Request } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Fetches the full user profile from the database based on the userId
 * attached to the request object by the authentication middleware.
 * @param req The Express Request object.
 * @returns The user object without the password, or null if not found.
 */
export const getAuthUser = async (req: Request) => {
  if (!req.user) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      accountType: true,
      createdAt: true
    }
  });

  return user;
};