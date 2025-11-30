// src/api/admin/admin.routes.ts

import { Router } from 'express';
import {
    getAdminDashboardStats, createCourse, getAdminCourses, getCourseDetails,
    createSection, addVideoToSection, updateCourse, deleteCourse,
    updateSection, deleteSection, updateVideo, deleteVideo, updateVideoOrder,
    getSettings, updateSettings,getMembershipPrices, updateMembershipPrices ,    updateSectionOrder,  getAdminUsers, grantLifetimeAccess 

} from './admin.controller';
// ==================== THIS IS THE FIX: Re-import the controller ====================
import { getAffiliateLeaderboard } from './affiliate.controller';
// ===================================================================================
import { getStripeFinancialStats, getStripeCustomers } from './stripe.controller';

const router = Router();

// Stats
router.get('/stats', getAdminDashboardStats);

// Course Management
router.get('/courses', getAdminCourses);
router.post('/courses', createCourse);
router.get('/courses/:courseId', getCourseDetails);
router.put('/courses/:courseId', updateCourse);
router.delete('/courses/:courseId', deleteCourse);

// Section Management
router.post('/courses/:courseId/sections', createSection);
router.put('/sections/:sectionId', updateSection);
router.delete('/sections/:sectionId', deleteSection);
router.put('/courses/:courseId/sections/order', updateSectionOrder);


// Video Management
router.post('/sections/:sectionId/videos', addVideoToSection);
router.put('/videos/:videoId', updateVideo);
router.delete('/videos/:videoId', deleteVideo);
router.put('/sections/:sectionId/videos/order', updateVideoOrder);

// ==================== THIS IS THE FIX: Restore the route ====================
router.get('/affiliates/leaderboard', getAffiliateLeaderboard);
// ============================================================================

router.get('/membership-prices', getMembershipPrices);
router.put('/membership-prices', updateMembershipPrices);


// Settings Management
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

router.get('/financials/stats', getStripeFinancialStats);
router.get('/financials/customers', getStripeCustomers);

router.get('/users', getAdminUsers);
router.put('/users/:userId/grant-lifetime', grantLifetimeAccess);

export default router;