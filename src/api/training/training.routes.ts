// src/api/training/training.routes.ts

import { Router } from 'express';
import { getAllCourses, getCourseById, updateVideoProgress, markSectionAsSeen, getLatestUpdates ,markCourseAsSeen } from './training.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
const router = Router();

router.get('/courses',authMiddleware, getAllCourses);
router.get('/courses/:courseId',authMiddleware, getCourseById);
router.post('/videos/:videoId/progress',authMiddleware, updateVideoProgress);
router.post('/sections/:sectionId/seen',authMiddleware,  markSectionAsSeen); // New Route
router.get('/updates',authMiddleware, getLatestUpdates); // New Route
router.post('/courses/:courseId/seen', authMiddleware, markCourseAsSeen); 

export default router;