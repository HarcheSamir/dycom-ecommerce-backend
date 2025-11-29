// src/api/product-discovery/product-discovery.controller.ts

import { Request, Response } from 'express';
import { prisma } from '../../index';
import { AuthenticatedRequest } from '../../utils/AuthRequestType';
import trends from 'google-trends-api'; 
import { Prisma } from '@prisma/client';
/**
 * @description Get a paginated, filterable, and sortable list of winning products.
 */
export const getWinningProducts = async (req: Request, res: Response) => {
  try {
    const {
      keyword,
      category,
      minPrice,
      maxPrice,
      sortBy = 'salesVolume',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (keyword) {
      where.title = { contains: keyword as string };
    }
    if (category) {
      where.firstLevelCategoryName = category as string;
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    let orderBy: any = { salesVolume: 'desc' };
    if (sortBy === 'price_asc') orderBy = { price: 'asc' };
    if (sortBy === 'price_desc') orderBy = { price: 'desc' };
    if (sortBy === 'newest') orderBy = { importedAt: 'desc' };

    const [products, total] = await prisma.$transaction([
      prisma.winningProduct.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.winningProduct.count({ where }),
    ]);

    res.status(200).json({
      data: products,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error in getWinningProducts:', error);
    res.status(500).json({ 
        error: 'An internal server error occurred.',
        message: (error as Error).message 
    });
  }
};

/**
 * @description Get details for a single winning product by its ID.
 */
export const getSingleProduct = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const product = await prisma.winningProduct.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.status(200).json({ data: product });
    } catch (error) {
        console.error('Error in getSingleProduct:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

/**
 * @description Add a product to the authenticated user's favorites.
 */
export const favoriteProduct = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id: productId } = req.params;
        const userId = req.user!.userId;

        await prisma.userFavorite.create({
            data: { userId, productId },
        });
        res.status(201).json({ message: 'Product added to favorites.' });
    } catch (error) {
        console.error('Error in favoriteProduct:', error);
        if ((error as any).code === 'P2002') { // Unique constraint violation
            return res.status(409).json({ error: 'Product is already in favorites.' });
        }
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

/**
 * @description Get a unique list of all product categories.
 */
export const getCategories = async (req: Request, res: Response) => {
    try {
        const categories = await prisma.winningProduct.findMany({
            where: { firstLevelCategoryName: { not: null } },
            distinct: ['firstLevelCategoryName'],
            select: { firstLevelCategoryName: true },
            orderBy: { firstLevelCategoryName: 'asc' },
        });
        res.status(200).json({ data: categories.map(c => c.firstLevelCategoryName) });
    } catch (error) {
        console.error('Error in getCategories:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};


/**
 * @description Get Google Trends data for a single product.
 */
export const getProductTrends = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const product = await prisma.winningProduct.findUnique({ where: { id } });
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        if (!product.googleTrendKeyword) {
            return res.status(404).json({ error: 'Trend keyword has not been generated for this product yet.' });
        }

        // Fetch data for the last 12 months
        const trendsData = await trends.interestOverTime({
            keyword: product.googleTrendKeyword,
            startTime: new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)), // 1 year ago
            endTime: new Date(),
        });

        const parsedData = JSON.parse(trendsData).default.timelineData;

        res.status(200).json({ data: parsedData });

    } catch (error) {
        console.error('Error in getProductTrends:', error);
        res.status(500).json({ error: 'An internal server error occurred while fetching trend data.' });
    }
};








/**
 * @description Get a paginated, searchable, and sortable list of unique suppliers using a raw SQL query to ensure stability.
 */
export const getSuppliers = async (req: Request, res: Response) => {
    try {
        const {
            page = '1',
            limit = '12',
            keyword,
            sortBy = 'productCount_desc'
        } = req.query as { page?: string, limit?: string, keyword?: string, sortBy?: string };

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClause = `WHERE shopId IS NOT NULL AND shopName IS NOT NULL`;
        const queryParams: (string | number)[] = [];

        if (keyword && keyword.trim() !== '') {
            whereClause += ` AND shopName LIKE ?`;
            queryParams.push(`%${keyword.trim()}%`);
        }

        let orderByClause: string;
        switch (sortBy) {
            case 'maxSales_desc':
                orderByClause = 'maxSales DESC';
                break;
            default:
                orderByClause = 'productCount DESC';
                break;
        }

        queryParams.push(limitNum);
        queryParams.push(offset);

        // *** THIS IS THE FIX: Using the correct table name "winning_products" ***
        const suppliersRaw: any[] = await prisma.$queryRawUnsafe(
            `SELECT
                shopId,
                shopName,
                shopUrl,
                shopEvaluationRate,
                COUNT(productId) as productCount,
                MAX(salesVolume) as maxSales
            FROM winning_products
            ${whereClause}
            GROUP BY shopId, shopName, shopUrl, shopEvaluationRate
            ORDER BY ${orderByClause}
            LIMIT ? OFFSET ?`,
            ...queryParams
        );

        const totalResult: any[] = await prisma.$queryRawUnsafe(
            `SELECT COUNT(DISTINCT shopId) as total FROM winning_products ${whereClause}`,
            ...queryParams.slice(0, queryParams.length - 2)
        );

        const total = Number(totalResult[0].total);

        const formattedSuppliers = suppliersRaw.map(s => ({
            ...s,
            shopId: s.shopId?.toString(),
            productCount: Number(s.productCount),
        }));

        res.status(200).json({
            data: formattedSuppliers,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            }
        });

    } catch (error) {
        console.error('Error in getSuppliers:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};





// Add this new function to the end of src/api/product-discovery/product-discovery.controller.ts

/**
 * @description Exports all unique suppliers as a CSV file.
 */
export const exportSuppliersAsCSV = async (req: Request, res: Response) => {
    try {
        // 1. Fetch ALL unique suppliers from the database without pagination.
        const suppliers = await prisma.winningProduct.groupBy({
            by: ['shopId', 'shopName', 'shopUrl', 'shopEvaluationRate'],
            _count: { productId: true },
            _max: { salesVolume: true },
            where: {
                shopId: { not: null },
                shopName: { not: null }
            },
            orderBy: {
                _count: {
                    productId: 'desc'
                }
            }
        });

        // 2. Define CSV Headers
        const csvHeaders = [
            'shopId',
            'shopName',
            'shopUrl',
            'shopEvaluationRate',
            'productCount',
            'maxSales'
        ];
        const headerRow = csvHeaders.join(',') + '\r\n';

        // 3. Format data into CSV rows
        const csvRows = suppliers.map(s => {
            const row = [
                s.shopId?.toString() || '',
                `"${s.shopName?.replace(/"/g, '""') || ''}"`, // Enclose name in quotes to handle commas
                s.shopUrl || '',
                s.shopEvaluationRate || '',
                s._count.productId,
                s._max.salesVolume || 0
            ];
            return row.join(',');
        }).join('\r\n');

        const csvContent = headerRow + csvRows;

        // 4. Set HTTP headers to trigger a file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="suppliers.csv"');
        res.status(200).end(csvContent);

    } catch (error) {
        console.error('Error in exportSuppliersAsCSV:', error);
        res.status(500).json({ error: 'An internal server error occurred while exporting data.' });
    }
};


