import prisma from "../../database/prisma";
import crypto from "crypto";

const QUESTIONS_PER_SESSION = 5;
// Force reload after migration

export class PublicService {
  /* ======================================================
     PUBLIC INTERVIEW REGISTRATION
  ====================================================== */

  /**
   * Public registration for interview (template-based, required)
   * @param candidateName
   * @param candidateEmail
   * @param templateId
   */
  static async registerForInterview(
    candidateName: string,
    candidateEmail: string,
    templateId: string
  ) {
    // Check for active (non-expired) session with same email
    const existingSession = await prisma.interviewSession.findFirst({
      where: {
        candidateEmail: candidateEmail.toLowerCase(),
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    if (existingSession) {
      throw new Error(
        "An active interview session already exists for this email address"
      );
    }


    // 1. Fetch the InterviewTemplate
    const template = await prisma.interviewTemplate.findUnique({
      where: { id: templateId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    console.log("🔍 TEMPLATE LOOKUP:", {
      templateId,
      found: !!template,
      title: template?.title,
      orgId: template?.organizationId,
      questionCount: template?.questions?.length || 0,
    });

    if (!template) {
      throw new Error("Invalid or missing interview template");
    }
    if (!template.organizationId) {
      throw new Error("Template is not linked to an organization");
    }

    // 2. Parse number of questions from template title (e.g., "3questions" or "5questions")
    const questionMatch = template.title.match(/(\d+)questions/i);
    const numQuestionsNeeded = questionMatch ? parseInt(questionMatch[1], 10) : 0;

    console.log("📋 QUESTION REQUIREMENT:", {
      templateTitle: template.title,
      numQuestionsNeeded,
    });

    let sessionQuestions: any[] = [];

    if (numQuestionsNeeded > 0) {
      // 3. If template has a specific question count requirement, fetch from question bank
      const bankQuestions = await prisma.questionBank.findMany({
        where: {
          organizationId: template.organizationId,
          isActive: true,
        },
      });

      if (bankQuestions.length === 0) {
        throw new Error("No active questions available in the question bank");
      }

      // Randomly select the required number of questions
      const selectedQuestions = bankQuestions
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(numQuestionsNeeded, bankQuestions.length));

      // Copy selected questions into InterviewQuestion records for this template
      const createdInterviewQuestions = await prisma.$transaction(async (tx) => {
        const interviewQuestions = await Promise.all(selectedQuestions.map((q, index) =>
          tx.interviewQuestion.create({
            data: {
              templateId: template.id,
              text: q.questionText,
              orderIndex: index,
            },
          })
        ));
        return interviewQuestions;
      });

      sessionQuestions = createdInterviewQuestions.map((q, index) => ({
        questionId: q.id,
        orderIndex: index,
      }));
    } else if (template.questions && template.questions.length > 0) {
      // Fallback: use template's own questions (use InterviewQuestion.id)
      sessionQuestions = template.questions.map((q) => ({
        questionId: q.id,
        orderIndex: q.orderIndex,
      }));
    } else {
      throw new Error("Template has no questions and no question count specified");
    }

    // 4. Create InterviewSession with orgId from template
    const accessToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Step 1: Create InterviewSession without sessionQuestions
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

    // Step 2: Create InterviewSessionQuestion records using createMany
    if (sessionQuestions.length > 0) {
      await prisma.sessionQuestion.createMany({
        data: sessionQuestions.map(q => ({
          sessionId: session.id,
          questionId: q.questionId, // InterviewQuestion.id
          orderIndex: q.orderIndex
        })),
      });
    }

    return {
      interviewLink: `${process.env.FRONTEND_BASE_URL || "http://localhost:5174"}/interview/start/${accessToken}`,
      expiresAt: session.expiresAt,
    };
  }

  /* ======================================================
     TEMPLATE-BASED PUBLIC SESSION (EXISTING)
  ====================================================== */

  static async startSession(
    templateId: string,
    candidateName: string,
    candidateEmail: string
  ) {
    const accessToken = crypto.randomBytes(24).toString("hex");

    return prisma.interviewSession.create({
      data: {
        templateId,
        candidateName,
        candidateEmail,
        accessToken,
        state: "IN_PROGRESS",
      },
      select: {
        id: true,
        accessToken: true,
        createdAt: true,
      },
    });
  }

  static async getSession(token: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      include: {
        template: {
          include: { questions: true },
        },
        sessionQuestions: {
          include: { question: true },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!session) {
      throw new Error("Invalid or expired link");
    }

    return session;
  }

  /* ======================================================
     🎯 PUBLIC RANDOM QUESTION SESSION (NEW)
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

    let orgId = organizationId;

    if (!orgId) {
      orgId = process.env.PUBLIC_ORG_ID || undefined;
    }

    // If still missing, pick the org that actually has active questions
    if (!orgId) {
      const orgWithQuestions = await prisma.questionBank.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { organizationId: true },
      });

      if (orgWithQuestions?.organizationId) {
        orgId = orgWithQuestions.organizationId;
      }
    }

    if (!orgId) {
      const org = await prisma.organization.findFirst();
      if (!org) {
        throw new Error("No organization configured for public sessions");
      }
      orgId = org.id;
    }

    // 1️⃣ Fetch active questions
    const questions = await prisma.questionBank.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        category: categories
          ? { in: categories as any }
          : undefined,
      },
    });

    if (questions.length === 0) {
      throw new Error("No questions available for public sessions");
    }

    const takeCount = Math.min(QUESTIONS_PER_SESSION, questions.length);

    // 2️⃣ Randomly select N questions
    const shuffled = questions.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, takeCount);

    const accessToken = crypto.randomBytes(24).toString("hex");

    // 3️⃣ Create session (no question locking unless template-based)
    const session = await prisma.interviewSession.create({
      data: {
        organizationId: orgId,
        candidateEmail,
        candidateName,
        accessToken,
        state: "IN_PROGRESS",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
        accessToken: true,
        createdAt: true,
      },
    });
    // Do NOT lock questions for random sessions (no templateId)
    return session;
  }

  /* ======================================================
     EXISTING PROGRESSION LOGIC (UNCHANGED)
     (Next step: extend to support sessionQuestions)
  ====================================================== */

  static async getNextQuestion(token: string) {
    // 1. Fetch session by accessToken
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      select: {
        id: true,
        state: true,
        expiresAt: true,
      },
    });

    if (!session) throw new Error("Invalid or expired link");
    if (session.expiresAt < new Date()) throw new Error("Interview session expired");
    if (session.state === "SUBMITTED") throw new Error("Interview already submitted");

    // Auto-transition to IN_PROGRESS
    if (session.state === "INVITED") {
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { state: "IN_PROGRESS" },
      });
    }

    // 2. Load SessionQuestions (ONLY source of truth)
    const sessionQuestions = await prisma.sessionQuestion.findMany({
      where: { sessionId: session.id },
      include: {
        question: {
          select: {
            text: true,
          },
        },
        questionBank: {
          select: {
            questionText: true,
            maxDuration: true,
          },
        },
      },
      orderBy: { orderIndex: "asc" },
    });

    const total = sessionQuestions.length;
    if (total === 0) {
      throw new Error("No questions configured for this interview");
    }

    // 3. Fetch already answered questions
    const responses = await prisma.interviewResponse.findMany({
      where: { sessionId: session.id },
      select: { sessionQuestionId: true },
    });

    const answeredIds = new Set(responses.map(r => r.sessionQuestionId));

    // 4. Find next unanswered SessionQuestion
    const nextSessionQuestion = sessionQuestions.find(
      sq => !answeredIds.has(sq.id)
    );

    // All questions answered
    if (!nextSessionQuestion) {
      return null;
    }

    // 5. Resolve question content
    let questionText: string;
    let maxDuration: number;

    if (nextSessionQuestion.questionBank) {
      questionText = nextSessionQuestion.questionBank.questionText;
      maxDuration = nextSessionQuestion.questionBank.maxDuration;
    } else if (nextSessionQuestion.question) {
      questionText = nextSessionQuestion.question.text;
      maxDuration = 300; // default for template questions
    } else {
      throw new Error("Question data missing for session question");
    }

    // 6. Calculate progress
    const index = answeredIds.size + 1;

    // 7. Return canonical response
    return {
      question: {
        id: nextSessionQuestion.id, // ✅ MUST be SessionQuestion.id
        questionText,
        maxDuration,
      },
      index, // 1-based
      total, // total SessionQuestions
    };
  }



  static async uploadResponse(token: string, videoPath: string) {
    // 1. Validate session
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      select: {
        id: true,
        state: true,
        expiresAt: true,
      },
    });

    if (!session) throw new Error("Invalid or expired link");
    if (session.expiresAt < new Date()) throw new Error("Interview session expired");
    if (session.state === "SUBMITTED") throw new Error("Interview already submitted");

    // 2. Load SessionQuestions
    const sessionQuestions = await prisma.sessionQuestion.findMany({
      where: { sessionId: session.id },
      select: { id: true },
      orderBy: { orderIndex: "asc" },
    });

    if (sessionQuestions.length === 0) {
      throw new Error("No questions configured for this interview");
    }

    // 3. Load existing responses
    const responses = await prisma.interviewResponse.findMany({
      where: { sessionId: session.id },
      select: { sessionQuestionId: true },
    });

    const answeredIds = new Set(responses.map(r => r.sessionQuestionId));

    // 4. Determine pending SessionQuestion
    const nextSessionQuestion = sessionQuestions.find(
      sq => !answeredIds.has(sq.id)
    );

    if (!nextSessionQuestion) {
      throw new Error("No pending question");
    }

    // 5. Idempotency guard (prevents double uploads)
    const existingResponse = await prisma.interviewResponse.findFirst({
      where: {
        sessionId: session.id,
        sessionQuestionId: nextSessionQuestion.id,
      },
    });

    if (existingResponse) {
      return {
        id: existingResponse.id,
        status: existingResponse.status,
      };
    }

    // 6. Save response
    const response = await prisma.interviewResponse.create({
      data: {
        sessionId: session.id,
        sessionQuestionId: nextSessionQuestion.id,
        videoUrl: videoPath.replace(/\\/g, "/"),
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
      },
    });

    return response;
  }



  static async submitInterview(token: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
    });

    if (!session) {
      throw new Error("Invalid or expired link");
    }

    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { state: "SUBMITTED" },
    });

    return true;
  }
}
