import { Router } from "express";
import { AdminController } from "../modules/admin/admin.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();

router.use(requireAuth as any);

/* ======================================================
   🧠 QUESTION BANK (ORG ADMIN or PLATFORM ADMIN)
====================================================== */
router.post(
  "/questions",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.createQuestion
);

router.get(
  "/questions",
  AdminController.listQuestions
);

router.patch(
  "/questions/:id/status",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.toggleQuestionStatus
);

/* -----------------------------------------------
   SESSIONS
   ^^^^^^^ These require ORG_ADMIN or REVIEWER
  ------------------------------------------------ */
router.get("/sessions", AdminController.listSessions);
router.get("/sessions/:id/responses", AdminController.getSessionResponses);
router.get("/sessions/:id/export", AdminController.exportSession);

/* PERSONALIZED SESSION */
router.post(
  "/sessions/personalized",
  requireRole("ORG_ADMIN"),
  AdminController.createPersonalizedSession
);

/* RESPONSE REVIEW */
router.patch("/responses/:id/review", AdminController.reviewResponse);

/* FINAL DECISION */
router.patch(
  "/sessions/:id/decision",
  requireRole("ORG_ADMIN"),
  AdminController.submitFinalDecision
);

export default router;
