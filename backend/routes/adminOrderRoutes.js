import { Router } from 'express';
import { listAllOrders, updateOrderStatus } from '../controllers/orderController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
router.use(protect, requireAdmin);
router.get('/', listAllOrders);
router.patch('/:id/status', updateOrderStatus);
export default router;
