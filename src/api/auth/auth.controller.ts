// src/api/auth/auth.controller.ts
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
            // FIX: We cast to 'any' here to handle the two different return types 
            // (User Object OR { requireOtp: true }) without TypeScript errors.
            const result: any = await authService.login(req.body);

            // CASE 1: Admin needs OTP
            if (result.requireOtp) {
                return res.status(202).json({
                    message: 'OTP sent to admin email.',
                    requireOtp: true,
                    email: result.email
                });
            }

            // CASE 2: Standard Login (User object)
            const user = result;

            // Create JWT Payload
            const payload = {
                userId: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                accountType: user.accountType,
            };

            // Sign the token
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

            res.status(200).json({
                message: 'Login successful',
                token: token,
                user: user,
            });
        } catch (error: any) {
            res.status(401).json({ message: error.message });
        }
    },

    // --- NEW: VERIFY OTP CONTROLLER ---
    async verifyAdminOtp(req: Request, res: Response) {
        try {
            const { email, otp } = req.body;

            if (!email || !otp) {
                return res.status(400).json({ message: 'Email and OTP are required.' });
            }

            // Call the service to check code
            const user = await authService.verifyAdminOtp({ email, otp });

            // If success, generate token
            const payload = {
                userId: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                accountType: user.accountType,
            };

            // Shorter expiration for admin sessions for security
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

            res.status(200).json({
                message: 'Admin verification successful',
                token: token,
                user: user
            });

        } catch (error: any) {
            res.status(401).json({ message: error.message });
        }
    },

    async forgotPassword(req: Request, res: Response) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ message: "Email is required" });

            await authService.requestPasswordReset(email);

            // Always return 200 for security (prevent email enumeration)
            res.status(200).json({ message: "If an account exists, a reset link has been sent." });
        } catch (error: any) {
            res.status(500).json({ message: "Internal server error" });
        }
    },

    async resetPassword(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) return res.status(400).json({ message: "Token and new password required" });

            if (newPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

            await authService.resetPassword(token, newPassword);
            res.status(200).json({ message: "Password reset successfully. You can now login." });
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    },

    /**
     * Set password for new Hotmart users using permanent accountSetupToken
     */
    async setPassword(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) {
                return res.status(400).json({ message: "Token and password are required" });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ message: "Password must be at least 6 characters" });
            }

            const result = await authService.setPasswordWithToken(token, newPassword);
            res.status(200).json(result);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }
};