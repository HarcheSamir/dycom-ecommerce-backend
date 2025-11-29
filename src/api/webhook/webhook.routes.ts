import express, { Router } from "express";
import { webhookController } from "./webhook.controller";

const router = Router();

router.post("/stripe", express.raw({ type: "application/json" }), webhookController.stripeWebhook);


export default router;