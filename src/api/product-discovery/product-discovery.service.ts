// src/api/product-discovery/product-discovery.service.ts

import axios from 'axios';
import { prisma } from '../../index';

// --- CONFIGURATION ---
const PAGES_TO_FETCH = 10;    // How many pages to loop through (e.g., 10 pages)
const ITEMS_PER_PAGE = 50;    // How many products to request per page

// This function will be called by our scheduled job
export const fetchHotProductsFromRapidAPI = async () => {
  console.log(`Starting job: Fetching ${PAGES_TO_FETCH} pages of hot products from RapidAPI...`);

  let totalProductsSaved = 0;
  let newProductsCount = 0;

  // Loop from page 1 to the number of pages we want to fetch
  for (let currentPage = 1; currentPage <= PAGES_TO_FETCH; currentPage++) {

    console.log(`Fetching page ${currentPage}...`);

    const options = {
      method: 'GET',
      url: 'https://aliexpress-business-api.p.rapidapi.com/affiliate-hot-products.php',
      params: {
        currency: 'USD',
        lang: 'en',
        pageIndex: currentPage.toString(), // <-- DYNAMIC PAGE INDEX
        pageSize: ITEMS_PER_PAGE.toString(),   // <-- INCREASED PAGE SIZE
        filter: 'LAST_VOLUME',               // <-- FILTER BY SALES
        sortBy: 'desc',                      // <-- SORT BY DESCENDING
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'aliexpress-business-api.p.rapidapi.com'
      }
    };

    try {
      const response = await axios.request(options);

      if (!response.data?.data?.itemList || !Array.isArray(response.data.data.itemList)) {
          console.log(`No items found on page ${currentPage}. Stopping job.`);
          break;
      }

      const products = response.data.data.itemList;
      console.log(`  > Found ${products.length} products on page ${currentPage}. Processing...`);

      for (const product of products) {
        if (!product.product_id) {
          continue;
        }

        const existingProduct = await prisma.winningProduct.findUnique({
          where: { productId: product.product_id },
        });

        // --- START: ROBUST DATA HANDLING BLOCK ---

        let priceString: string | undefined;
        let currencyString: string | undefined;

        if (product.target_app_sale_price) {
            priceString = product.target_app_sale_price;
            currencyString = product.target_app_sale_price_currency || product.target_sale_price_currency;
        } else {
            priceString = product.target_sale_price;
            currencyString = product.target_sale_price_currency;
        }

        const finalPrice = parseFloat(priceString || "0") || 0;
        const finalCurrency = currencyString || "USD";

        // --- END: ROBUST DATA HANDLING BLOCK ---

        const newHistoryEntry = {
          date: new Date().toISOString(),
          sales: product.lastest_volume,
        };
        
        const productData = {
          productId: product.product_id,
          title: product.product_title,
          productUrl: product.product_detail_url,
          imageUrl: product.product_main_image_url,
          price: finalPrice,
          currency: finalCurrency,
          salesVolume: product.lastest_volume || 0,
          categoryName: product.second_level_category_name,
          firstLevelCategoryName: product.first_level_category_name,
          historicalData: existingProduct?.historicalData
            ? [...(Array.isArray(existingProduct.historicalData) ? existingProduct.historicalData : []), newHistoryEntry]
            : [newHistoryEntry],
          shopName: product.shop_name,
          shopEvaluationRate: product.evaluate_rate,
           shopUrl: product.shop_url,
          shopId: product.shop_id,
        };

        await prisma.winningProduct.upsert({
          where: { productId: product.product_id },
          update: productData,
          create: productData,
        });

        if (!existingProduct) {
          newProductsCount++;
        }
      }
      totalProductsSaved += products.length;

      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`Error fetching page ${currentPage} from RapidAPI:`, error);
      break;
    }
  }

  if (newProductsCount > 0) {
    console.log(`Job finished. Creating notifications for ${newProductsCount} new products.`);
    const users = await prisma.user.findMany({ select: { id: true } });

    if (users.length > 0) {
      const notificationData = users.map(user => ({
        userId: user.id,
        message: `${newProductsCount} new trending products were discovered. Check them out now!`
      }));

      await prisma.notification.createMany({
        data: notificationData,
      });
      console.log(`Created notifications for ${users.length} users.`);
    }
  }

  console.log(`Job finished: Successfully saved or updated ${totalProductsSaved} products in total.`);
};