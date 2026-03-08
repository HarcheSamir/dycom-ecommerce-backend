// src/api/admin/admin.routes.ts

import { Router } from 'express';
import {
    getAdminDashboardStats, createCourse, getAdminCourses, getCourseDetails,
    createSection, addVideoToSection, updateCourse, deleteCourse,
    updateSection, deleteSection, updateVideo, deleteVideo, updateVideoOrder,
    getSettings, updateSettings, getMembershipPrices, updateMembershipPrices, updateSectionOrder, getAdminUsers, grantLifetimeAccess,
    exportAdminUsers, getAdminUserDetails, updateUserSubscription, syncStripeSubscription, addStripePayment, getPastDueUsers,
    getAdminUnreadCounts, createUser, grantSmmaAccess, updateSmmaAccess

} from './admin.controller';
import { getAffiliateLeaderboard } from './affiliate.controller';
import { getCloserStats, getStripeFinancialStats, getStripeCustomers, getStripeTransactions, assignCloserToTransaction } from './stripe.controller';

const router = Router();

// Stats
router.get('/stats', getAdminDashboardStats);

// Unread counts for notification badges
router.get('/unread-counts', getAdminUnreadCounts);

router.get('/users/export', exportAdminUsers);


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

router.get('/affiliates/leaderboard', getAffiliateLeaderboard);

router.get('/membership-prices', getMembershipPrices);
router.put('/membership-prices', updateMembershipPrices);


// Settings Management
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

router.get('/financials/stats', getStripeFinancialStats);
router.get('/financials/customers', getStripeCustomers);
router.get('/financials/past-due', getPastDueUsers);
router.get('/financials/transactions', getStripeTransactions);
router.post('/financials/assign-closer', assignCloserToTransaction);
router.get('/financials/closers', getCloserStats);

router.get('/users', getAdminUsers);
router.get('/users/:userId/details', getAdminUserDetails);
router.put('/users/:userId/grant-lifetime', grantLifetimeAccess);
router.post('/users/create', createUser);

router.put('/users/:userId/subscription', updateUserSubscription); // Manual edit
router.post('/users/:userId/sync-subscription', syncStripeSubscription); // Sync from Stripe ID
router.post('/users/:userId/sync-payment', addStripePayment); // Add Transaction from Stripe ID
router.post('/users/:userId/grant-smma', grantSmmaAccess); // Grant SMMA course access
router.put('/users/:userId/smma-access', updateSmmaAccess); // Update SMMA course access

// Newsletter
import { sendNewsletter, getNewsletterHistory, getRecipientCount } from './newsletter.controller';
router.post('/newsletter/send', sendNewsletter);
router.get('/newsletter/history', getNewsletterHistory);
router.get('/newsletter/recipient-count', getRecipientCount);

// Announcements (Bandes Annonces)
import multer from 'multer';
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, toggleAnnouncement } from './announcement.controller';
const announcementUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.get('/announcements', getAnnouncements);
router.post('/announcements', announcementUpload.single('image'), createAnnouncement);
router.put('/announcements/:id', announcementUpload.single('image'), updateAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);
router.put('/announcements/:id/toggle', toggleAnnouncement);


export default router;