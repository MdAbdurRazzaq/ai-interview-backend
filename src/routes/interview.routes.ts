import { Router } from 'express';
import { InterviewController } from '../modules/interviews/interview.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';

const router = Router();

/**
 * Create interview template
 * Only PLATFORM_ADMIN or ORG_ADMIN
 */
router.post(
  '/templates',
  requireAuth,
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  InterviewController.createTemplate
);

/**
 * List templates (admins & reviewers)
 */
router.get(
  '/templates',
  requireAuth,
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN', 'REVIEWER'),
  InterviewController.listTemplates
);

/**
 * Archive template
 * Only PLATFORM_ADMIN or ORG_ADMIN
 */
router.patch(
  '/templates/:id/archive',
  requireAuth,
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  InterviewController.archiveTemplate
);

/**
 * Restore template
 * Only PLATFORM_ADMIN or ORG_ADMIN
 */
router.patch(
  '/templates/:id/restore',
  requireAuth,
  requireRole('PLATFORM_ADMIN', 'ORG_ADMIN'),
  InterviewController.restoreTemplate
);

export default router;
