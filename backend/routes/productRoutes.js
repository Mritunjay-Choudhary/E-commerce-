import { Router } from 'express';
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from '../controllers/productController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = Router();
router.get('/', listProducts);
router.get('/:id', getProduct);
router.post('/', protect, requireAdmin, upload.array('images', 5), createProduct);
router.patch('/:id', protect, requireAdmin, upload.array('images', 5), updateProduct);
router.delete('/:id', protect, requireAdmin, deleteProduct);
export default router;
