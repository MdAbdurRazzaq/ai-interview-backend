import { Request, Response } from "express";
import { PublicService } from "./public.service";
import prisma from "../../database/prisma";
import { processInterviewResponse } from "../../ai/ai.processor";

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
     TEMPLATE-BASED SESSION (LEGACY)
  ====================================================== */
  static async startSession(req: Request, res: Response) {
    try {
      const { templateId, candidateName, candidateEmail } = req.body;

      if (!templateId || !candidateEmail) {
        return res
          .status(400)
          .json({ message: "templateId and candidateEmail are required" });
      }

      const session = await PublicService.startSession(
        templateId,
        candidateName,
        candidateEmail
      );

      res.status(201).json(session);
    } catch (err: any) {
      console.error("❌ START SESSION ERROR:", err);
      res.status(500).json({ message: "Failed to start session" });
    }
  }

  /* ======================================================
     PUBLIC RANDOM SESSION
  ====================================================== */
  static async startPublicRandomSession(req: Request, res: Response) {
    try {
      const { email, name, categories } = req.body;

      if (!email) {
        return res.status(400).json({ message: "email is required" });
      }

      const PUBLIC_ORG_ID = process.env.PUBLIC_ORG_ID;
      if (!PUBLIC_ORG_ID) {
        throw new Error("PUBLIC_ORG_ID not configured");
      }

      const session = await PublicService.startPublicRandomSession({
        organizationId: PUBLIC_ORG_ID,
        candidateEmail: email,
        candidateName: name || "Candidate",
        categories,
      });

      res.status(201).json(session);
    } catch (err: any) {
      console.error("❌ START PUBLIC RANDOM SESSION ERROR:", err);
      res.status(500).json({
        message: err.message || "Failed to start public session",
      });
    }
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
    try {
      const { token } = req.params;
      const data = await PublicService.getNextQuestion(token);

      if (!data) {
        return res.status(204).send();
      }

      // ✅ Data already normalized by service
      res.json(data);
    } catch (err: any) {
      console.error("❌ GET NEXT QUESTION ERROR:", err);
      res.status(400).json({ message: err.message });
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

    if (!response) {
      return res.status(200).json({
        message: "Response already recorded",
      });
    }

    processInterviewResponse(response.id);

    return res.status(201).json({
      message: "Response uploaded",
      responseId: response.id,
    });


    } catch (err: any) {
      console.error("❌ UPLOAD RESPONSE ERROR:", err);
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
