import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authService } from './auth.service';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set!');
}
export const authController = {
    // --- SIGNUP CONTROLLER ---
    async signUp(req: AuthenticatedRequest, res: Response) {
        try {
            const { user, token } = await authService.signUp(req.body);
            res.status(201).json({ message: 'User created successfully', user, token });
        } catch (error: any) {
            res.status(409).json({ message: error.message }); // 409 Conflict
        }
    },
    // --- LOGIN CONTROLLER ---
    async login(req: AuthenticatedRequest, res: Response) {
        try {
            const user = await authService.login(req.body);

            // Create JWT Payload
            const payload = {
                userId: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                accountType: user.accountType,
            };

            // Sign the token
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); // Token expires in 7 days

            res.status(200).json({
                message: 'Login successful',
                token: token,
                user: user,
            });
        } catch (error: any) {
            res.status(401).json({ message: error.message }); // 401 Unauthorized
        }
    },
};