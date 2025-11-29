// src/api/product-discovery/product-discovery.routes.ts

import { Router } from 'express';
import {
    getWinningProducts,
    getSingleProduct,
    favoriteProduct,
    getCategories,
    getProductTrends,
    getSuppliers,
    exportSuppliersAsCSV

} from './product-discovery.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();
router.get('/suppliers', getSuppliers);
router.get('/suppliers/export', exportSuppliersAsCSV);
router.get('/meta/categories', getCategories);
router.get('/', getWinningProducts);
router.get('/:id', getSingleProduct);
router.post('/:id/favorite', authMiddleware, favoriteProduct);
router.get('/:id/trends', authMiddleware, getProductTrends);



export default router;