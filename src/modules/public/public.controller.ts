import { Request, Response } from "express";
import { PublicService } from "./public.service";
import prisma from "../../database/prisma";
import { processInterviewResponse } from "../../ai/ai.processor";

const LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE =
  "This legacy interview flow is disabled while the production interview flow is being stabilized.";

export class PublicController {
  /* ======================================================
     GET PUBLIC TEMPLATES
  ====================================================== */
  static async getPublicTemplates(req: Request, res: Response) {
    try {
      const templates = await prisma.interviewTemplate.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(templates);
    } catch (err: any) {
      console.error("❌ GET PUBLIC TEMPLATES ERROR:", err);
      res.status(500).json({
        message: "Failed to fetch templates",
      });
    }
  }

  /* ======================================================
     INVITATION PREVIEW
  ====================================================== */
  static async getInvitationPreview(req: Request, res: Response) {
    try {
      const invitation = await PublicService.getInvitationPreviewByToken(
        req.params.token
      );

      return res.json(invitation);
    } catch (err: any) {
      const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;

      if (statusCode >= 500) {
        console.error("❌ GET INVITATION PREVIEW ERROR:", err);
      }

      return res.status(statusCode).json({
        message:
          statusCode === 404 || statusCode === 409 || statusCode === 410
            ? err.message
            : "Failed to load invitation preview",
      });
    }
  }

  /* ======================================================
     INVITATION ACCEPT
  ====================================================== */
  static async acceptInvitation(req: Request, res: Response) {
    try {
      const result = await PublicService.acceptInvitationByToken(req.params.token);

      return res.status(result.created ? 201 : 200).json(result);
    } catch (err: any) {
      const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;

      if (statusCode >= 500) {
        console.error("❌ ACCEPT INVITATION ERROR:", err);
      }

      return res.status(statusCode).json({
        message:
          statusCode === 404 || statusCode === 409 || statusCode === 410
            ? err.message
            : "Failed to accept invitation",
      });
    }
  }

  /* ======================================================
     TEMPLATE-BASED SESSION (LEGACY)
  ====================================================== */
  static async legacyInterviewFlowDisabled(_req: Request, res: Response) {
    return res.status(410).json({
      message: LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE,
    });
  }

  static async startSession(req: Request, res: Response) {
    return PublicController.legacyInterviewFlowDisabled(req, res);
  }

  /* ======================================================
     PUBLIC RANDOM SESSION
  ====================================================== */
  static async startPublicRandomSession(req: Request, res: Response) {
    return PublicController.legacyInterviewFlowDisabled(req, res);
  }

  /* ======================================================
     SESSION READ
  ====================================================== */
  static async getSession(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const session = await PublicService.getSession(token);
      res.json(session);
    } catch (err: any) {
      res.status(404).json({ message: "Invalid or expired session" });
    }
  }

  /* ======================================================
     NEXT QUESTION (CANONICAL)
  ====================================================== */
  
  
  static async getNextQuestion(req: Request, res: Response) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    try {
      const { token } = req.params;
      const data = await PublicService.getNextQuestion(token);

      return res.json(data);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  }


  /* ======================================================
     RESPONSE UPLOAD
  ====================================================== */
  static async uploadResponse(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const { sessionQuestionId } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Video file required" });
      }

      if (!sessionQuestionId) {
        return res
          .status(400)
          .json({ message: "sessionQuestionId required" });
      }

      const videoUrl = `/uploads/videos/${req.file.filename}`;

    const response = await PublicService.uploadResponse(
      token,
      sessionQuestionId,
      videoUrl
    );

    processInterviewResponse(response.id);

    return res.status(201).json({
      message: "Response uploaded successfully",
      responseId: response.id,
      sessionQuestionId,
    });


    } catch (err: any) {
      console.error("❌ UPLOAD RESPONSE ERROR:", err);
      if (err.message === "Session question already answered") {
        return res.status(409).json({ message: err.message });
      }

      res.status(400).json({ message: err.message || "Upload failed" });
    }
  }

  /* ======================================================
     SUBMIT INTERVIEW
  ====================================================== */
  static async submitInterview(req: Request, res: Response) {
    try {
      const { token } = req.params;
      await PublicService.submitInterview(token);
      res.json({ message: "Interview submitted successfully" });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }

  /* ======================================================
     PUBLIC REGISTRATION
  ====================================================== */
  static async registerForInterview(req: Request, res: Response) {
    try {
      const { candidateName, candidateEmail, templateId } = req.body;

      if (!candidateName || !candidateEmail || !templateId) {
        return res.status(400).json({
          message: "candidateName, candidateEmail, and templateId are required",
        });
      }

      const result = await PublicService.registerForInterview(
        candidateName,
        candidateEmail,
        templateId
      );

      res.status(201).json(result);
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        return res.status(409).json({ message: err.message });
      }

      res.status(500).json({
        message: err.message || "Failed to register for interview",
      });
    }
  }
}
