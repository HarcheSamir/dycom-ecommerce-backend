// In ./src/api/payment/payment.routes.ts

import { Router } from "express";
import { paymentController } from "./payment.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();


router.get("/products", paymentController.getProductsAndPrices);


router.post("/create-subscription", authMiddleware, paymentController.createSubscription);
router.post("/create-course-payment-intent", authMiddleware, paymentController.createCoursePaymentIntent);
router.post("/cancel-subscription", authMiddleware, paymentController.cancelSubscription);
router.post("/reactivate-subscription", authMiddleware, paymentController.reactivateSubscription);


export default router;