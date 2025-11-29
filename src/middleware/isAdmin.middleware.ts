import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../utils/AuthRequestType';
import { prisma } from '..';

export const isAdminMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized. Please log in.' });
  }

  const { userId } = req.user;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true },
    });

    if (!user || user.accountType !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden. Administrator access required.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'An internal server error occurred.' });
  }
};