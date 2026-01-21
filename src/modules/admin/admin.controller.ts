import { Request, Response } from "express";
import { AdminService } from "./admin.service";
import prisma from "../../database/prisma";
import { FinalDecision } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { organizationId: string };
    }
  }
}

export class AdminController {

  // static async submitFinalDecision(req: Request, res: Response) {
  //   console.log("🚨 FINAL DECISION CONTROLLER HIT");
  //   return res.status(418).json({ message: "I am alive" });
  // }

  /* ===============================
     LIST SESSIONS
  =============================== */
  static async listSessions(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const organizationId = req.user.organizationId;

      const sessions = await AdminService.listSessions(organizationId);
      res.json(sessions);
    } catch (err) {
      console.error("❌ LIST SESSIONS ERROR:", err);
      res.status(500).json({ message: "Failed to load sessions" });
    }
  }

  /* ===============================
     GET SESSION RESPONSES
  =============================== */
  static async getSessionResponses(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const organizationId = req.user.organizationId;

      const responses = await AdminService.getSessionResponses(
        organizationId,
        req.params.id
      );
      res.json(responses);
    } catch (err) {
      console.error("❌ GET RESPONSES ERROR:", err);
      res.status(500).json({ message: "Failed to load responses" });
    }
  }

  /* ===============================
     REVIEW INDIVIDUAL RESPONSE
  =============================== */
  static async reviewResponse(req: Request, res: Response) {
    try {
      const { reviewerScore, reviewerNotes } = req.body;
      const responseId = req.params.id;

      if (reviewerScore === undefined && reviewerNotes === undefined) {
        return res.status(400).json({ message: "Missing request body" });
      }

      const updated = await AdminService.reviewResponse(
        responseId,
        reviewerScore,
        reviewerNotes
      );

      return res.json(updated);
    } catch (err: any) {
      console.error("❌ REVIEW RESPONSE ERROR:", err);
      return res.status(500).json({
        message: "Internal server error",
        error: err.message,
      });
    }
  }

  /* ===============================
     SUBMIT FINAL DECISION
     PASS | HOLD | FAIL
  =============================== */
  static async submitFinalDecision(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { finalDecision, reviewerSummary, finalScore } = req.body;

      const session = await prisma.interviewSession.update({
        where: { id },
        data: {
          finalDecision,
          reviewerSummary: reviewerSummary || null,
          finalScore:
            typeof finalScore === "number" ? Math.round(finalScore) : null,
          decisionAt: new Date(),
          state: "SUBMITTED",
        },
      });

      return res.json(session);
    } catch (err: any) {
      console.error("❌ FINAL DECISION ERROR:", err);
      return res.status(500).json({
        message: "Failed to submit final decision",
        error: err.message,
      });
    }
  }



  /* ===============================
     EXPORT SESSION
  =============================== */
  static async exportSession(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const organizationId = req.user.organizationId;

      const data = await AdminService.exportSession(
        organizationId,
        req.params.id
      );
      res.json(data);
    } catch (err) {
      console.error("❌ EXPORT SESSION ERROR:", err);
      res.status(500).json({ message: "Failed to export session" });
    }
  }

  /* ======================================================
     🧠 QUESTION BANK (ADMIN)
  ====================================================== */

  static async createQuestion(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const organizationId = req.user.organizationId;
      console.log("[CREATE QUESTION] Full request body:", JSON.stringify(req.body, null, 2));
      console.log("[CREATE QUESTION] Content-Type:", req.get("content-type"));
      let { questionText, category, maxDuration, difficulty } = req.body;

      // Coerce maxDuration to number
      if (typeof maxDuration === "string") {
        maxDuration = parseInt(maxDuration, 10);
      }

      console.log("[CREATE QUESTION] Extracted values:");
      console.log("  - questionText:", questionText, "| type:", typeof questionText);
      console.log("  - category:", category, "| type:", typeof category);
      console.log("  - maxDuration:", maxDuration, "| type:", typeof maxDuration);
      console.log("  - difficulty:", difficulty, "| type:", typeof difficulty);
      console.log("  - organizationId:", organizationId);

      if (!questionText || !category || !Number.isFinite(maxDuration) || maxDuration <= 0) {
        console.log("[CREATE QUESTION] ❌ Validation failed:");
        console.log("  - questionText truthy?", !!questionText);
        console.log("  - category truthy?", !!category);
        console.log("  - maxDuration valid number?", Number.isFinite(maxDuration) && maxDuration > 0);
        return res.status(400).json({
          message: "questionText, category (valid enum), and maxDuration (positive number) are required",
          received: { questionText, category, maxDuration, difficulty },
          hints: {
            validCategories: ["INTRO", "TECHNICAL", "BEHAVIORAL", "SYSTEM_DESIGN", "CUSTOM"],
            maxDurationMustBePositiveNumber: true
          }
        });
      }

      const createdBy = "system-admin";

      // 🔍 VALIDATE: Organization exists before trying to create question
      console.log("[CREATE QUESTION] Checking if organization exists:", organizationId);
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        console.error("[CREATE QUESTION] ❌ Organization not found:", organizationId);
        return res.status(400).json({
          message: "Organization not found",
          organizationId,
          hint: "Verify the organizationId in your auth token matches an existing organization in the database"
        });
      }
      console.log("[CREATE QUESTION] ✓ Organization exists:", org.id);

      try {
        console.log("[CREATE QUESTION] About to call AdminService.createQuestion with:");
        console.log({
          organizationId,
          createdBy,
          questionText,
          category,
          maxDuration,
          difficulty,
        });
        const question = await AdminService.createQuestion({
          organizationId,
          createdBy,
          questionText,
          category,
          maxDuration,
          difficulty,
        });
        console.log("[CREATE QUESTION] ✓ Success! Created:", question.id);
        return res.status(201).json(question);
      } catch (prismaErr: any) {
        console.error("❌ PRISMA CREATE QUESTION ERROR:");
        console.error("  Code:", prismaErr.code);
        console.error("  Message:", prismaErr.message);
        console.error("  Meta:", prismaErr.meta);
        console.error("  Full error:", prismaErr);
        if (prismaErr.code === 'P2002') {
          return res.status(400).json({ message: "Duplicate question" });
        }
        if (prismaErr.code === 'P2003') {
          return res.status(400).json({ 
            message: "Foreign key constraint violation - organization may have been deleted",
            code: prismaErr.code 
          });
        }
        return res.status(400).json({
          message: "Prisma error creating question",
          code: prismaErr.code,
          error: prismaErr.message,
          meta: prismaErr.meta,
        });
      }
    } catch (err: any) {
      console.error("❌ CREATE QUESTION ERROR:", err);
      return res.status(500).json({
        message: "Failed to create question",
        error: err.message,
      });
    }
  }

  static async listQuestions(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const organizationId = req.user.organizationId;
      const { category, isActive } = req.query;

      const questions = await AdminService.listQuestions(organizationId, {
        category: category as any,
        isActive:
          isActive !== undefined ? isActive === "true" : undefined,
      });

      return res.json(questions);
    } catch (err: any) {
      console.error("❌ LIST QUESTIONS ERROR:", err);
      return res.status(500).json({
        message: "Failed to list questions",
        error: err.message,
      });
    }
  }

  static async toggleQuestionStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          message: "isActive must be a boolean",
        });
      }

      const updated = await AdminService.toggleQuestionStatus(id, isActive);
      return res.json(updated);
    } catch (err: any) {
      console.error("❌ TOGGLE QUESTION ERROR:", err);
      return res.status(500).json({
        message: "Failed to update question status",
        error: err.message,
      });
    }
  }

  /* ======================================================
     🎯 PERSONALIZED INTERVIEW SESSION (ADMIN)
  ====================================================== */

  static async createPersonalizedSession(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const organizationId = req.user.organizationId;
      const {
        candidateName,
        candidateEmail,
        interviewTitle,
        questionIds,
        expiresInHours,
      } = req.body;

      if (
        !candidateName ||
        !candidateEmail ||
        !interviewTitle ||
        typeof interviewTitle !== 'string' ||
        interviewTitle.trim().length === 0 ||
        !Array.isArray(questionIds) ||
        questionIds.length === 0
      ) {
        return res.status(400).json({
          message:
            "candidateName, candidateEmail, interviewTitle and non-empty questionIds are required",
        });
      }

      const session = await AdminService.createPersonalizedSession({
        organizationId,
        candidateName,
        candidateEmail,
        interviewTitle: interviewTitle.trim(),
        questionIds,
        expiresInHours,
      });

      return res.status(201).json(session);
    } catch (err: any) {
      console.error("❌ CREATE PERSONALIZED SESSION ERROR:", err);
      return res.status(500).json({
        message: "Failed to create personalized session",
        error: err.message,
      });
    }
  }
}
