import express, { Router } from "express";
import { webhookController } from "./webhook.controller";
import { hotmartController } from "./hotmart.controller"; 
const router = Router();

router.post("/stripe", express.raw({ type: "application/json" }), webhookController.stripeWebhook);

router.post("/hotmart", express.json(), hotmartController.handleWebhook);

export default router;