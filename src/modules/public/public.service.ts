import { text } from "stream/consumers";
import prisma from "../../database/prisma";
import crypto from "crypto";

const LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE =
  "This legacy interview flow is disabled while the production interview flow is being stabilized.";
const QUESTIONS_PER_SESSION = 5;

export class PublicService {
  static startSession(templateId: any, candidateName: any, candidateEmail: any) {
    throw new Error(LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE);
  }
  /* ======================================================
     PUBLIC INTERVIEW REGISTRATION (TEMPLATE-BASED)
     RULE: NEVER mutate InterviewTemplate or InterviewQuestion
  ====================================================== */

  static async registerForInterview(
    candidateName: string,
    candidateEmail: string,
    templateId: string
  ) {
    const normalizedEmail = candidateEmail.toLowerCase();
    const trimmedCandidateName = candidateName.trim();
    const accessToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return prisma.$transaction(async (tx) => {
      // 1️⃣ Prevent duplicate active sessions for the same email
      const existingSession = await tx.interviewSession.findFirst({
        where: {
          candidateEmail: normalizedEmail,
          expiresAt: { gt: new Date() },
        },
      });

      if (existingSession) {
        throw new Error(
          "An active interview session already exists for this email address"
        );
      }

      // 2️⃣ Load template with questions
      const template = await tx.interviewTemplate.findUnique({
        where: { id: templateId },
        include: {
          questions: { orderBy: { orderIndex: "asc" } },
        },
      });

      if (!template) {
        throw new Error("Invalid or missing interview template");
      }

      if (!template.organizationId) {
        throw new Error("Template is not linked to an organization");
      }

      // 3️⃣ Resolve questions (Template → QuestionBank fallback)
      let lockedQuestions: {
        questionId: string | null;
        questionBankId: string | null;
        orderIndex: number;
      }[];

      if (template.questions.length > 0) {
        lockedQuestions = template.questions.map((q) => ({
          questionId: q.id,
          questionBankId: null,
          orderIndex: q.orderIndex,
        }));
      } else {
        const bankQuestions = await tx.questionBank.findMany({
          where: {
            organizationId: template.organizationId,
            isActive: true,
          },
          orderBy: { createdAt: "asc" },
        });

        if (bankQuestions.length === 0) {
          throw new Error(
            "Template has no questions and no active QuestionBank entries found"
          );
        }

        lockedQuestions = bankQuestions.map((q, index) => ({
          questionId: null,
          questionBankId: q.id,
          orderIndex: index,
        }));
      }

      // 🛑 HARD SAFETY CHECK — prevents silent corruption forever
      const uniqueKey = new Set(
        lockedQuestions.map((q) => q.questionId ?? q.questionBankId)
      );

      if (uniqueKey.size !== lockedQuestions.length) {
        throw new Error(
          "Session creation aborted: duplicate questions detected"
        );
      }

      // 4️⃣ Create interview session
      const session = await tx.interviewSession.create({
        data: {
          organizationId: template.organizationId,
          templateId: template.id,
          candidateName: trimmedCandidateName,
          candidateEmail: normalizedEmail,
          accessToken,
          expiresAt,
          state: "INVITED",
        },
      });

      // 5️⃣ Create SessionQuestions (single source of truth)
      await tx.sessionQuestion.createMany({
        data: lockedQuestions.map((q) => ({
          sessionId: session.id,
          orderIndex: q.orderIndex,
          questionId: q.questionId,
          questionBankId: q.questionBankId,
        })),
      });

      // 6️⃣ Final sanity check (defensive)
      const count = await tx.sessionQuestion.count({
        where: { sessionId: session.id },
      });

      if (count !== lockedQuestions.length) {
        throw new Error(
          `SessionQuestion mismatch: expected ${lockedQuestions.length}, got ${count}`
        );
      }

      // 7️⃣ Return interview link
      return {
        interviewLink: `${
          process.env.FRONTEND_BASE_URL || "http://localhost:5174"
        }/interview/start/${accessToken}`,
        expiresAt: session.expiresAt,
      };
    });
  }



  /* ======================================================
     PUBLIC RANDOM QUESTION SESSION
     DISABLED: Noncanonical SessionQuestion writer
  ====================================================== */

  static async startPublicRandomSession(params: {
    organizationId?: string;
    candidateEmail: string;
    candidateName?: string;
    categories?: string[];
  }) {
    throw new Error(LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE);
  }

  /* ======================================================
     SESSION READ
  ====================================================== */

  static async getSession(token: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      include: {
        sessionQuestions: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!session) throw new Error("Invalid or expired link");
    return session;
  }

  /* ======================================================
     NEXT QUESTION (SINGLE SOURCE OF TRUTH)
  ====================================================== */

  static async getNextQuestion(token: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      select: { id: true, state: true, expiresAt: true },
    });

    if (!session) throw new Error("Invalid or expired link");
    if (session.expiresAt < new Date()) throw new Error("Interview session expired");
    if (session.state === "SUBMITTED") throw new Error("Interview already submitted");

    if (session.state === "INVITED") {
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { state: "IN_PROGRESS" },
      });
    }

    const [next, total] = await prisma.$transaction([
      prisma.sessionQuestion.findFirst({
        where: {
          sessionId: session.id,
          status: "PENDING",
        },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          orderIndex: true,
          question: { select: { text: true } },
          questionBank: { select: { questionText: true, maxDuration: true } },
        },
      }),
      prisma.sessionQuestion.count({
        where: { sessionId: session.id },
      }),
    ]);

    if (!next) {
      return { completed: true };
    }

    const questionText =
      next.questionBank?.questionText ??
      next.question?.text;

    if (!questionText) {
      throw new Error("Question text missing");
    }

    const maxDuration =
      typeof next.questionBank?.maxDuration === "number"
        ? next.questionBank.maxDuration
        : 300; // ✅ DEFAULT FOR TEMPLATE QUESTIONS

    return {
      sessionQuestionId: next.id,
      questionText,
      maxDuration,
      index: next.orderIndex + 1,
      total,
    };
  }

  /* ======================================================
     RESPONSE UPLOAD
  ====================================================== */

  static async uploadResponse(
    token: string,
    sessionQuestionId: string,
    videoPath: string
  ) {
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      select: { id: true, state: true, expiresAt: true },
    });

    if (!session) throw new Error("Invalid or expired link");
    if (session.expiresAt < new Date()) throw new Error("Interview session expired");
    if (session.state === "SUBMITTED") throw new Error("Interview already submitted");

    try {
      return await prisma.$transaction(async (tx) => {
        const sessionQuestion = await tx.sessionQuestion.findFirst({
          where: {
            id: sessionQuestionId,
            sessionId: session.id,
          },
          select: { id: true, status: true },
        });

        if (!sessionQuestion) {
          throw new Error("Invalid session question");
        }

        if (sessionQuestion.status === "ANSWERED") {
          throw new Error("Session question already answered");
        }

        const response = await tx.interviewResponse.create({
          data: {
            sessionId: session.id,
            sessionQuestionId,
            videoUrl: videoPath.replace(/\\/g, "/"),
            status: "PENDING",
          },
        });

        await tx.sessionQuestion.update({
          where: { id: sessionQuestionId },
          data: { status: "ANSWERED" },
        });

        return response;
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new Error("Session question already answered");
      }

      throw err;
    }
  }



  /* ======================================================
     SUBMIT INTERVIEW
  ====================================================== */

  static async submitInterview(token: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
    });

    if (!session) throw new Error("Invalid or expired link");

    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { state: "SUBMITTED" },
    });

    return true;
  }
}
