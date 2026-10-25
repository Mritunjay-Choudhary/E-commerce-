import { Router } from 'express';
import { createOrUpdateReview, deleteReview, listProductReviews } from '../controllers/reviewController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();
router.get('/:productId/reviews', listProductReviews);
router.put('/:productId/reviews', protect, createOrUpdateReview);
router.delete('/reviews/:reviewId', protect, deleteReview);
export default router;
