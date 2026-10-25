import { Router } from 'express';
import { getUserByAdmin } from '../controllers/adminController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
router.use(protect, requireAdmin);
router.get('/users/:id', getUserByAdmin);
export default router;
