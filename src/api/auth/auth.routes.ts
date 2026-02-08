// src/api/auth/auth.routes.ts
import { Router } from 'express';
import { authController } from './auth.controller';

const router = Router();

router.post('/signup', authController.signUp);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyAdminOtp); // <--- Ensure this is here
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/set-password', authController.setPassword);
export default router;