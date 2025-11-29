// src/index.ts
import 'dotenv/config'; // ADD THIS LINE FIRST

import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import authRoutes from './api/auth/auth.routes';
import paymentRoutes from './api/payment/payment.routes';
import webhookRoutes from './api/webhook/webhook.routes';
import { hasMembershipMiddleware } from './middleware/hasMembership.middleware';
import contentCreatorRoutes from './api/content-creator/content-creator.routes';
import userRoutes from './api/user/user.routes';
import { authMiddleware } from './middleware/auth.middleware';
import trainingRoutes from './api/training/training.routes';
import cors from 'cors';
import cron from 'node-cron'; // Import node-cron
import { fetchHotProductsFromRapidAPI } from './api/product-discovery/product-discovery.service';
import productDiscoveryRoutes from './api/product-discovery/product-discovery.routes';
import dashboardRoutes from './api/dashboard/dashboard.routes';
import adminRoutes from './api/admin/admin.routes'; // <-- IMPORT NEW ROUTES
import { isAdminMiddleware } from './middleware/isAdmin.middleware';
import affiliateRoutes from './api/affiliate/affiliate.routes';
import { exec } from 'child_process';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
const app = express();
export const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Enable CORS for specific origin or all origins
app.use(cors({
  origin: ['https://influencecontact.com', 'http://localhost:5173', 'https://makebrainers.com'], // Allow both production and local dev
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH',  'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use('/webhook', webhookRoutes);

// Middleware to parse JSON bodies
app.use(express.json());

// A simple test route
app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Express + TypeScript + Prisma!');
});

// ===================================================================
// === MANUAL TRIGGER ENDPOINT (UNAUTHENTICATED) =====================
// ===================================================================
app.get('/api/admin/trigger-job/:secret', async (req: Request, res: Response) => {
    const { secret } = req.params;
    const JOB_SECRET = 'password'; // IMPORTANT: Create a long random string here

    if (secret !== JOB_SECRET) {
        return res.status(403).json({ message: 'Forbidden: Invalid secret key.' });
    }

    res.status(202).json({ message: 'Accepted: Job triggered successfully. Check server logs for progress.' });

    console.log('--- MANUAL JOB TRIGGERED ---');
    try {
        console.log('[1/2] Fetching hot products from RapidAPI...');
        await fetchHotProductsFromRapidAPI();
        console.log('[1/2] Fetching completed successfully.');
    } catch (error) {
        console.error('An error occurred during the manually triggered fetch job:', error);
    } finally {
        // THIS 'finally' BLOCK ENSURES ENRICHMENT ALWAYS RUNS
        console.log('[2/2] Starting product enrichment script...');
        exec('npm run enrich:products', (error, stdout, stderr) => {
            if (error) {
                console.error(`Enrichment script failed to execute: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Enrichment script stderr: ${stderr}`);
            }
            console.log(`Enrichment script stdout: \n${stdout}`);
            console.log('[2/2] Product enrichment script finished.');
            console.log('--- MANUAL JOB FINISHED ---');
        });
    }
});

// --- All your authenticated routes come AFTER the trigger endpoint ---
app.use('/api/auth', authRoutes);
// app.use('/api/content-creators', authMiddleware,contentCreatorRoutes);
app.use('/api/content-creators', authMiddleware, hasMembershipMiddleware,contentCreatorRoutes);

app.use('/api/profile',authMiddleware,userRoutes)
app.use('/api/payment',paymentRoutes);
app.use('/api/training', authMiddleware, trainingRoutes);
app.use('/api/winning-products', authMiddleware, hasMembershipMiddleware,productDiscoveryRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/affiliate', authMiddleware, affiliateRoutes);
app.use('/api/admin', authMiddleware, isAdminMiddleware, adminRoutes);



cron.schedule('0 4 * * *', async () => {
  console.log('--- SCHEDULED JOB STARTING ---');
  try {
    console.log('[1/2] Fetching hot products from RapidAPI...');
    await fetchHotProductsFromRapidAPI();
    console.log('[1/2] Fetching completed successfully.');
  } catch (error) {
    console.error('An error occurred during the scheduled product fetch job:', error);
  } finally {
      // THIS 'finally' BLOCK ENSURES ENRICHMENT ALWAYS RUNS
      console.log('[2/2] Starting product enrichment script...');
      exec('npm run enrich:products', (error, stdout, stderr) => {
          if (error) {
              console.error(`Enrichment script failed to execute: ${error.message}`);
              return;
          }
          if (stderr) {
              console.error(`Enrichment script stderr: ${stderr}`);
          }
          console.log(`Enrichment script stdout: \n${stdout}`);
          console.log('[2/2] Product enrichment script finished.');
          console.log('--- SCHEDULED JOB BLOCK FINISHED ---');
      });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  // fetchHotProductsFromRapidAPI();
});
