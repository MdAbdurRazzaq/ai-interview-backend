import { Router } from 'express';
import { SessionController } from '../modules/sessions/session.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';

const router = Router();

// ADMIN only
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  SessionController.create
);

// PUBLIC (no auth)
router.get('/public/:token', SessionController.getPublic);

export default router;
