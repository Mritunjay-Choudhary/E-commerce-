import { Router } from 'express';
import { loginUser, logoutUser, registerUser, verifyEmail } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();
router.post('/register', registerUser);
router.post('/verify-email', verifyEmail);
router.post('/login', loginUser);
router.post('/logout', protect, logoutUser);
router.get('/me', protect, (req, res) => res.json({ user: req.user }));
export default router;
