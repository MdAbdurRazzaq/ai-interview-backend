import { text } from "stream/consumers";
import prisma from "../../database/prisma";
import crypto from "crypto";

const QUESTIONS_PER_SESSION = 5;

export class PublicService {
  static startSession(templateId: any, candidateName: any, candidateEmail: any) {
    throw new Error("Method not implemented.");
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
    // 1️⃣ Prevent duplicate active sessions for the same email
    const existingSession = await prisma.interviewSession.findFirst({
      where: {
        candidateEmail: candidateEmail.toLowerCase(),
        expiresAt: { gt: new Date() },
      },
    });

    if (existingSession) {
      throw new Error(
        "An active interview session already exists for this email address"
      );
    }

    // 2️⃣ Load template with questions
    const template = await prisma.interviewTemplate.findUnique({
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
    let sessionQuestionData:
      | { questionId: string; orderIndex: number }[]
      | { questionBankId: string; orderIndex: number }[];

    if (template.questions.length > 0) {
      // ✅ TEMPLATE MODE
      sessionQuestionData = template.questions.map((q) => ({
        questionId: q.id,
        orderIndex: q.orderIndex,
      }));
    } else {
      // ✅ QUESTION BANK FALLBACK MODE
      const bankQuestions = await prisma.questionBank.findMany({
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

      // 🔒 Lock questions ONCE (no duplicates possible)
      sessionQuestionData = bankQuestions.map((q, index) => ({
        questionBankId: q.id,
        orderIndex: index,
      }));
    }

    // 🛑 HARD SAFETY CHECK — prevents silent corruption forever
    const uniqueKey = new Set(
      sessionQuestionData.map((q) =>
        "questionId" in q ? q.questionId : q.questionBankId
      )
    );

    if (uniqueKey.size !== sessionQuestionData.length) {
      throw new Error(
        "Session creation aborted: duplicate questions detected"
      );
    }

    // 4️⃣ Create interview session
    const accessToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await prisma.interviewSession.create({
      data: {
        organizationId: template.organizationId,
        templateId: template.id,
        candidateName: candidateName.trim(),
        candidateEmail: candidateEmail.toLowerCase(),
        accessToken,
        expiresAt,
        state: "INVITED",
      },
    });

    // 5️⃣ Create SessionQuestions (single source of truth)
    await prisma.sessionQuestion.createMany({
      data: sessionQuestionData.map((q) => ({
        sessionId: session.id,
        orderIndex: q.orderIndex,
        questionId: "questionId" in q ? q.questionId : null,
        questionBankId: "questionBankId" in q ? q.questionBankId : null,
      })),
    });

    // 6️⃣ Final sanity check (defensive)
    const count = await prisma.sessionQuestion.count({
      where: { sessionId: session.id },
    });

    if (count !== sessionQuestionData.length) {
      throw new Error(
        `SessionQuestion mismatch: expected ${sessionQuestionData.length}, got ${count}`
      );
    }

    // 7️⃣ Return interview link
    return {
      interviewLink: `${
        process.env.FRONTEND_BASE_URL || "http://localhost:5174"
      }/interview/start/${accessToken}`,
      expiresAt: session.expiresAt,
    };
  }



  /* ======================================================
     PUBLIC RANDOM QUESTION SESSION
     RULE: Random sessions ALSO create SessionQuestions
  ====================================================== */

  static async startPublicRandomSession(params: {
    organizationId?: string;
    candidateEmail: string;
    candidateName?: string;
    categories?: string[];
  }) {
    const {
      candidateEmail,
      candidateName = "Candidate",
      categories,
      organizationId,
    } = params;

    let orgId = organizationId || process.env.PUBLIC_ORG_ID;

    if (!orgId) {
      const orgWithQuestions = await prisma.questionBank.findFirst({
        where: { isActive: true },
        select: { organizationId: true },
      });
      orgId = orgWithQuestions?.organizationId;
    }

    if (!orgId) throw new Error("No organization available for public sessions");

    // 1️⃣ Fetch question bank questions
    const questions = await prisma.questionBank.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        category: categories ? { in: categories as any } : undefined,
      },
    });

    if (questions.length === 0) {
      throw new Error("No questions available for public sessions");
    }

    const selected = questions
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(QUESTIONS_PER_SESSION, questions.length));

    // 2️⃣ Create session
    const accessToken = crypto.randomBytes(24).toString("hex");

    const session = await prisma.interviewSession.create({
      data: {
        organizationId: orgId,
        candidateEmail,
        candidateName,
        accessToken,
        state: "IN_PROGRESS",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 3️⃣ Lock random questions into SessionQuestion
    await prisma.sessionQuestion.createMany({
      data: selected.map((q, index) => ({
        sessionId: session.id,
        questionId: "", // Required field for schema, empty for question bank sessions
        questionBankId: q.id,
        orderIndex: index,
      })),
    });

    return {
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
    };
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

    const next = await prisma.sessionQuestion.findFirst({
      where: {
        sessionId: session.id,
        status: "PENDING",
      },
      orderBy: { orderIndex: "asc" },
      include: {
        question: { select: { text: true } },
        questionBank: { select: { questionText: true, maxDuration: true } },
      },
    });

    if (!next) return null;

    const total = await prisma.sessionQuestion.count({
      where: { sessionId: session.id },
    });

    const answered = await prisma.sessionQuestion.count({
      where: {
        sessionId: session.id,
        status: "ANSWERED",
      },
    });

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
      question: {
        questionText,   // ✅ always present
        maxDuration,    // ✅ always number
      },
      index: answered + 1,
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

    const sessionQuestion = await prisma.sessionQuestion.findFirst({
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
      return prisma.interviewResponse.findFirst({
        where: { sessionQuestionId },
      });
    }

    const [response] = await prisma.$transaction([
      prisma.interviewResponse.create({
        data: {
          sessionId: session.id,
          sessionQuestionId,
          videoUrl: videoPath.replace(/\\/g, "/"),
          status: "PENDING",
        },
      }),
      prisma.sessionQuestion.update({
        where: { id: sessionQuestionId },
        data: { status: "ANSWERED" },
      }),
    ]);

    return response;
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
