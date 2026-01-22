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
    // 1️⃣ Prevent multiple active sessions per email
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

    // 2️⃣ Load template + its questions (READ-ONLY)
    const template = await prisma.interviewTemplate.findUnique({
      where: { id: templateId },
      include: {
        questions: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!template) throw new Error("Invalid or missing interview template");
    if (!template.organizationId)
      throw new Error("Template is not linked to an organization");

    if (!template.questions || template.questions.length === 0) {
      throw new Error("Template has no questions configured");
    }

    // 3️⃣ Create session
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

    // 4️⃣ Lock questions via SessionQuestion (ONLY place questions are bound)
    await prisma.sessionQuestion.createMany({
      data: template.questions.map((q) => ({
        sessionId: session.id,
        questionId: q.id,
        orderIndex: q.orderIndex,
      })),
    });

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
    // 1️⃣ Load session
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      select: { id: true, state: true, expiresAt: true },
    });

    if (!session) throw new Error("Invalid or expired link");
    if (session.expiresAt < new Date())
      throw new Error("Interview session expired");
    if (session.state === "SUBMITTED")
      throw new Error("Interview already submitted");

    // Auto-transition
    if (session.state === "INVITED") {
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { state: "IN_PROGRESS" },
      });
    }

    // 2️⃣ Get next unanswered question ONLY
    const next = await prisma.sessionQuestion.findFirst({
      where: {
        sessionId: session.id,
        status: "PENDING",
      },
      include: {
        question: { select: { text: true } },
        questionBank: {
          select: { questionText: true, maxDuration: true },
        },
      },
      orderBy: { orderIndex: "asc" },
    });

    // No more questions → interview complete
    if (!next) {
      return null;
    }

    // 3️⃣ Progress numbers come from DB state
    const total = await prisma.sessionQuestion.count({
      where: { sessionId: session.id },
    });

    const answered = await prisma.sessionQuestion.count({
      where: {
        sessionId: session.id,
        status: "ANSWERED",
      },
    });

    const text =
      next.questionBank?.questionText ??
      next.question?.text ??
      null;

    if (!text) {
      throw new Error("Question text missing");
    }

    return {
      sessionQuestionId: next.id,
      question: {
        text,
        maxDuration: next.questionBank?.maxDuration ?? 300,
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
    // 1️⃣ Validate session
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      select: { id: true, state: true, expiresAt: true },
    });

    if (!session) throw new Error("Invalid or expired link");
    if (session.expiresAt < new Date())
      throw new Error("Interview session expired");
    if (session.state === "SUBMITTED")
      throw new Error("Interview already submitted");

    // 2️⃣ Validate SessionQuestion belongs to this session
    const sessionQuestion = await prisma.sessionQuestion.findFirst({
      where: {
        id: sessionQuestionId,
        sessionId: session.id,
      },
    });

    if (!sessionQuestion) {
      throw new Error("Invalid session question for this interview");
    }

    // 3️⃣ Idempotency: if already answered, do NOTHING
    if (sessionQuestion.status === "ANSWERED") {
      return prisma.interviewResponse.findFirst({
        where: { sessionQuestionId },
      });
    }

    // 4️⃣ Atomically:
    //    - create response
    //    - mark question as ANSWERED
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
