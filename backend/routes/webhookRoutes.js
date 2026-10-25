import { Router } from 'express';
import express from 'express';
import { handleRazorpayWebhook } from '../controllers/orderController.js';

const router = Router();
router.post('/razorpay', express.raw({ type: 'application/json' }), handleRazorpayWebhook);
export default router;
