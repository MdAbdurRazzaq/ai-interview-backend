import { Router } from "express";
import { AdminController } from "../modules/admin/admin.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";

const router = Router();
const PERSONALIZED_SESSION_DISABLED_MESSAGE =
  "Personalized session creation is temporarily disabled while the interview flow is being stabilized.";

router.use(requireAuth as any);

/* ======================================================
   CANDIDATES
   ^^^^^^^^ admin-scoped candidate management
====================================================== */
router.get(
  "/candidates",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.listCandidates
);

router.post(
  "/candidates",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.createCandidate
);

router.get(
  "/candidates/:candidateId",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.getCandidate
);

/* ======================================================
   INVITATIONS
   ^^^^^^^^ admin-scoped invitation management
====================================================== */
router.get(
  "/invitations",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.listInvitations
);

router.post(
  "/invitations",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.createInvitation
);

router.get(
  "/invitations/:invitationId",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.getInvitation
);

router.post(
  "/invitations/:invitationId/revoke",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.revokeInvitation
);

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
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  (_req, res) => {
    return res.status(410).json({
      message: PERSONALIZED_SESSION_DISABLED_MESSAGE,
    });
  }
);

/* RESPONSE REVIEW */
router.patch("/responses/:id/review", AdminController.reviewResponse);

/* FINAL DECISION */
router.patch(
  "/sessions/:id/decision",
  requireRole("ORG_ADMIN", "PLATFORM_ADMIN"),
  AdminController.submitFinalDecision
);

export default router;
