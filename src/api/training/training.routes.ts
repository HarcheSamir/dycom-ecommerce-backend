// src/api/training/training.routes.ts

import { Router } from 'express';
import { getAllCourses, getCourseById, updateVideoProgress } from './training.controller';

const router = Router();

router.get('/courses', getAllCourses);
router.get('/courses/:courseId', getCourseById);
router.post('/videos/:videoId/progress', updateVideoProgress);

export default router;