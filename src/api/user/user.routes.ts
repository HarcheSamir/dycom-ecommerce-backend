import { Router } from 'express';
import { getUserProfile, updatePassword, getUserNotifications, updateUserProfile, markWelcomeAsSeen, requestEmailChange, confirmEmailChange } from './user.controller';

const router = Router();

// Route for getting the authenticated user's full profile
// This route must be protected by your authentication middleware
router.get('/me', getUserProfile);

// Route for updating the authenticated user's password
// This route must also be protected by your authentication middleware
router.patch('/update-password', updatePassword);

// Route for getting user notifications
router.get('/notifications', getUserNotifications);

router.patch('/me', updateUserProfile);
router.patch('/welcome-seen', markWelcomeAsSeen);

// Email change routes
router.post('/request-email-change', requestEmailChange);
router.post('/confirm-email-change', confirmEmailChange);

// User Avatar
import multer from 'multer';
import { uploadAvatar } from './user.controller';
const upload = multer();
router.post('/avatar', upload.single('avatar'), uploadAvatar);

export default router;