import { Router } from "express";
import {
  cancelOrder,
  createOrder,
  getMyOrders,
  getOrder,
  verifyOrderPayment,
} from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();
router.use(protect);
router.route("/").post(createOrder).get(getMyOrders);
router.post("/:id/verify-payment", verifyOrderPayment);
router.get("/:id", getOrder);
router.patch("/:id/cancel", cancelOrder);
export default router;
