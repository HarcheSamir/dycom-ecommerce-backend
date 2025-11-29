import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../utils/AuthRequestType';

const JWT_SECRET = process.env.JWT_SECRET as string;

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // --- MODIFICATION START ---
    // Update the type of the decoded payload
    const decoded = jwt.verify(token, JWT_SECRET) as { 
        userId: string, 
        email: string, 
        firstName: string, 
        lastName: string, 
        accountType: 'USER' | 'ADMIN' 
    };
    // --- MODIFICATION END ---
    
    req.user = decoded; // Attach user payload to the request object
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};