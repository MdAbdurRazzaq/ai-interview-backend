import { Router } from "express";
import { PublicController } from "../modules/public/public.controller";
import { videoUpload } from "../middlewares/upload.middleware";

const router = Router();

// Start interview (creates session)
router.post("/session", PublicController.startSession);

// Public random session (question bank)
router.post("/start", PublicController.startPublicRandomSession);

// Get full session (optional)
router.get("/session/:token", PublicController.getSession);

// ✅ Get next unanswered question
router.get("/session/:token/next", PublicController.getNextQuestion);

router.post(
  "/session/:token/responses/:questionId",
  videoUpload.single("video"),
  PublicController.uploadResponse
);

router.post("/session/:token/submit", PublicController.submitSession);

export default router;
