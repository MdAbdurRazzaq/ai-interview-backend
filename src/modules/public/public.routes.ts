import { Router } from "express";
import { PublicController } from "./public.controller";
import { videoUpload } from "../../middlewares/upload.middleware";

const router = Router();

/* ======================================================
   PUBLIC INTERVIEW TEMPLATES & REGISTRATION
====================================================== */
router.get("/templates", PublicController.getPublicTemplates);
router.post("/interviews/register", PublicController.registerForInterview);

/* ======================================================
   🎯 PUBLIC RANDOM QUESTION SESSION (NEW)
====================================================== */
router.post("/start", PublicController.startPublicRandomSession);

/* ======================================================
   TEMPLATE-BASED PUBLIC SESSION (EXISTING)
====================================================== */
router.post("/session", PublicController.startSession);
router.get("/session/:token", PublicController.getSession);
router.get("/session/:token/next", PublicController.getNextQuestion);

router.post(
  "/session/:token/responses",
  videoUpload.single("video"),
  PublicController.uploadResponse
);

router.post(
  "/session/:token/submit",
  PublicController.submitInterview
);

export default router;
