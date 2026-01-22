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
        where: {
          status: 'ACTIVE',
        },
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      console.log('[PUBLIC TEMPLATES] Found', templates.length, 'templates');
      res.json(templates);
    } catch (err: any) {
      console.error("❌ GET PUBLIC TEMPLATES ERROR:", err);
      if (err instanceof Error) {
        console.error('Stack:', err.stack);
      }
      res.status(500).json({
        message: "Failed to fetch templates",
        error: err.message,
        stack: err.stack,
      });
    }
  }

  /* ======================================================
     TEMPLATE-BASED PUBLIC SESSION (EXISTING)
  ====================================================== */

  static async startSession(req: Request, res: Response) {
    try {
      const { templateId, candidateName, candidateEmail } = req.body;

      if (!templateId || !candidateEmail) {
        return res.status(400).json({
          message: "templateId and candidateEmail are required",
        });
      }

      const session = await PublicService.startSession(
        templateId,
        candidateName,
        candidateEmail
      );

      res.status(201).json(session);
    } catch (err: any) {
      console.error("❌ START TEMPLATE SESSION ERROR:", err);
      res.status(500).json({
        message: "Failed to start session",
        error: err.message,
      });
    }
  }

  /* ======================================================
     🎯 PUBLIC RANDOM QUESTION SESSION (NEW)
  ====================================================== */

// public.controller.ts
  static async startPublicRandomSession(req: Request, res: Response) {
    try {
      const { email, name, categories } = req.body;

      if (!email) {
        return res.status(400).json({
          message: "email is required",
        });
      }

      // 🔥 TEMP: default public organization
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

      return res.status(201).json(session);
    } catch (err: any) {
      console.error("❌ START PUBLIC RANDOM SESSION ERROR:", err);
      return res.status(500).json({
        message: "Failed to start public session",
        error: err.message,
      });
    }
  }


  /* ======================================================
     SESSION READ & PROGRESSION
  ====================================================== */

  static async getSession(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const session = await PublicService.getSession(token);
      res.json(session);
    } catch (err: any) {
      console.error("❌ GET SESSION ERROR:", err);
      res.status(404).json({
        message: "Invalid or expired session",
        error: err.message,
      });
    }
  }

  static async getNextQuestion(req: Request, res: Response) {
    try {
      const { token } = req.params;
      console.log("🔍 Getting next question for token:", token);
      const data = await PublicService.getNextQuestion(token);
      
      // If no more questions (interview complete)
      if (!data) {
        console.log("✅ Interview complete - no more questions");
        return res.status(204).send(); // 204 No Content
      }
      
      console.log("✅ Next question data:", {
        sessionQuestionId: data.sessionQuestionId,
        index: data.index,
        total: data.total,
      });
      res.json(data);
    } catch (err: any) {
      console.error("❌ GET NEXT QUESTION ERROR:", err);
      console.error("❌ Error stack:", err.stack);
      res.status(400).json({
        message: err.message,
      });
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
        return res.status(400).json({ message: "sessionQuestionId required" });
      }

      const videoUrl = `/uploads/videos/${req.file.filename}`;

      // Call service with sessionQuestionId (NO backend guessing)
      const response = await PublicService.uploadResponse(token, sessionQuestionId, videoUrl);

      // 🔁 async AI evaluation
      processInterviewResponse(response.id);

      return res.status(201).json({
        message: "Response uploaded",
        responseId: response.id,
      });
    } catch (err: any) {
      console.error("❌ UPLOAD RESPONSE ERROR:", err);
      return res.status(400).json({
        message: err.message || "Upload failed",
      });
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
      console.error("❌ SUBMIT INTERVIEW ERROR:", err);
      res.status(400).json({
        message: err.message,
      });
    }
  }

  /* ======================================================
     PUBLIC INTERVIEW REGISTRATION
  ====================================================== */

  static async registerForInterview(req: Request, res: Response) {
    try {
      const { candidateName, candidateEmail, templateId } = req.body;

      console.log("📋 REGISTRATION REQUEST:", {
        candidateName,
        candidateEmail,
        templateId,
        allBodyKeys: Object.keys(req.body),
      });

      // Validate required fields
      if (!candidateName || !candidateEmail || !templateId) {
        return res.status(400).json({
          message: "candidateName, candidateEmail, and templateId are required",
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(candidateEmail)) {
        return res.status(400).json({
          message: "candidateEmail must be a valid email address",
        });
      }

      const result = await PublicService.registerForInterview(
        candidateName,
        candidateEmail,
        templateId
      );

      res.status(201).json(result);
    } catch (err: any) {
      console.error("❌ REGISTER FOR INTERVIEW ERROR:", err);

      // Handle duplicate active session
      if (
        err.message.includes(
          "An active interview session already exists for this email"
        )
      ) {
        return res.status(409).json({
          message: err.message,
        });
      }

      // Handle template not found
      if (err.message.includes("Invalid or missing interview template") || err.message.includes("Template is not linked")) {
        return res.status(404).json({
          message: err.message,
        });
      }

      res.status(500).json({
        message: err.message || "Failed to register for interview",
      });
    }
  }
}
