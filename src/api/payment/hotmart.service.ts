import axios from 'axios';

const AUTH_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const PRODUCT_ID = '6800970';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let cachedPrice: any = null;
let priceExpiry: number = 0;

export const getHotmartToken = async () => {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

    try {
        const response = await axios.post(
            `${AUTH_URL}?grant_type=client_credentials`,
            {},
            {
                headers: {
                    'Authorization': process.env.HOTMART_BASIC,
                    'Content-Type': 'application/json'
                }
            }
        );

        cachedToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
        return cachedToken;
    } catch (error: any) {
        console.error("❌ Hotmart Auth Error:", error.response?.data || error.message);
        return null;
    }
};

/**
 * Get product price from Hotmart API
 * 
 * Process:
 * 1. Get product details to retrieve the ucode
 * 2. Use ucode to fetch offers (which contains pricing)
 * 3. Extract price from the main offer
 */
export const getProductPrice = async () => {
    // Return cached price if still valid (cache for 1 hour)
    if (cachedPrice && Date.now() < priceExpiry) {
        return cachedPrice;
    }

    const token = await getHotmartToken();
    
    if (!token) {
        console.error("❌ No token available");
        return null;
    }

    try {
        
        const productResponse = await axios.get(
            'https://developers.hotmart.com/products/api/v1/products',
            {
                params: { id: PRODUCT_ID },
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (!productResponse.data?.items?.[0]) {
            console.error("❌ Product not found");
            return null;
        }

        const product = productResponse.data.items[0];

        // STEP 2: Get offers using the ucode
        
        const offersResponse = await axios.get(
            `https://developers.hotmart.com/products/api/v1/products/${product.ucode}/offers`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (!offersResponse.data?.items?.[0]) {
            console.error("❌ No offers found");
            return null;
        }

        // STEP 3: Extract price from the main offer
        const offers = offersResponse.data.items;
        const mainOffer = offers.find((o: any) => o.is_main_offer) || offers[0];

        if (!mainOffer?.price) {
            console.error("❌ No price found in offers");
            return null;
        }

        const result = {
            value: mainOffer.price.value,
            currency: mainOffer.price.currency_code,
            formatted: new Intl.NumberFormat('en-US', { 
                style: 'currency', 
                currency: mainOffer.price.currency_code 
            }).format(mainOffer.price.value),
            offerCode: mainOffer.code,
            offerName: mainOffer.name || 'Main Offer',
            paymentMode: mainOffer.payment_mode
        };

        // Cache the result for 1 hour
        cachedPrice = result;
        priceExpiry = Date.now() + (300 * 1000);
        
        return result;

    } catch (error: any) {
        console.error("❌ Error fetching product price:", {
            status: error.response?.status,
            message: error.response?.data || error.message
        });
        return null;
    }
};

/**
 * Get all offers for a product (useful if you have multiple pricing tiers)
 */
export const getAllProductOffers = async () => {
    const token = await getHotmartToken();
    
    if (!token) {
        console.error("❌ No token available");
        return null;
    }

    try {
        // Get product ucode first
        const productResponse = await axios.get(
            'https://developers.hotmart.com/products/api/v1/products',
            {
                params: { id: PRODUCT_ID },
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const ucode = productResponse.data?.items?.[0]?.ucode;
        if (!ucode) return null;

        // Get all offers
        const offersResponse = await axios.get(
            `https://developers.hotmart.com/products/api/v1/products/${ucode}/offers`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return offersResponse.data?.items || [];

    } catch (error: any) {
        console.error("❌ Error fetching offers:", error.message);
        return null;
    }
};