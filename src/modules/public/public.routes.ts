import { RequestHandler, Router } from "express";
import { PublicController } from "./public.controller";
import { videoUpload } from "../../middlewares/upload.middleware";

const router = Router();

const noCacheDynamicInterviewRoutes: RequestHandler = (req, res, next) => {
   delete req.headers["if-none-match"];
   delete req.headers["if-modified-since"];

   res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
   });

   next();
};

/* ======================================================
   PUBLIC INTERVIEW TEMPLATES & REGISTRATION
====================================================== */
router.get("/templates", PublicController.getPublicTemplates);
router.post(
   "/interviews/register",
   noCacheDynamicInterviewRoutes,
   PublicController.registerForInterview
);

/* ======================================================
   🎯 PUBLIC RANDOM QUESTION SESSION (NEW)
====================================================== */
router.post(
   "/start",
   noCacheDynamicInterviewRoutes,
   PublicController.legacyInterviewFlowDisabled
);

/* ======================================================
   TEMPLATE-BASED PUBLIC SESSION (EXISTING)
====================================================== */
router.post(
  "/session",
  noCacheDynamicInterviewRoutes,
  PublicController.legacyInterviewFlowDisabled
);
router.get("/session/:token", noCacheDynamicInterviewRoutes, PublicController.getSession);
router.get(
   "/session/:token/next",
   noCacheDynamicInterviewRoutes,
   PublicController.getNextQuestion
);

router.post(
  "/session/:token/responses",
   noCacheDynamicInterviewRoutes,
  videoUpload.single("video"),
  PublicController.uploadResponse
);

router.post(
  "/session/:token/submit",
   noCacheDynamicInterviewRoutes,
  PublicController.submitInterview
);

export default router;
