import { Router } from 'express';
import { getUserProfile, updatePassword, getUserNotifications, updateUserProfile } from './user.controller';

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


export default router;