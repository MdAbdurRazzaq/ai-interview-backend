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
    let session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      include: {
        sessionQuestions: {
          include: {
            question: {
              select: {
                id: true,
                text: true,
              }
            },
            questionBank: {
              select: {
                id: true,
                questionText: true,
                maxDuration: true,
              }
            }
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!session) throw new Error("Invalid or expired link");
    if (session.state === "SUBMITTED")
      throw new Error("Interview already submitted");

    // Auto-transition from INVITED to IN_PROGRESS on first question fetch
    if (session.state === "INVITED") {
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { state: "IN_PROGRESS" },
      });
    }

    // Filter to ONLY active questions (those with associated question or questionBank)
    const activeQuestions = session.sessionQuestions.filter(
      sq => (sq.question && sq.question.id) || (sq.questionBank && sq.questionBank.id)
    );

    if (activeQuestions.length === 0) {
      throw new Error("No questions configured for this interview");
    }

    // Fetch responses separately to determine which questions have been answered
    const responses = await prisma.interviewResponse.findMany({
      where: { sessionId: session.id },
      select: { sessionQuestionId: true }
    });

    // Track which session questions have been answered
    const answeredSessionQuestionIds = new Set(
      responses.map(r => r.sessionQuestionId)
    );

    // Find the first unanswered question
    const nextSessionQuestion = activeQuestions.find(
      sq => !answeredSessionQuestionIds.has(sq.id)
    );

    // If no more unanswered questions, return null (will be handled in controller to return 204)
    if (!nextSessionQuestion) {
      return null;
    }

    // Determine which source the question came from (template or questionBank)
    let questionData: { id: string; questionText: string; maxDuration: number };
    
    if (nextSessionQuestion.questionBank) {
      // Question from QuestionBank (has maxDuration)
      questionData = {
        id: nextSessionQuestion.questionBank.id,
        questionText: nextSessionQuestion.questionBank.questionText,
        maxDuration: nextSessionQuestion.questionBank.maxDuration,
      };
    } else if (nextSessionQuestion.question) {
      // Question from template (InterviewQuestion) - provide default maxDuration
      questionData = {
        id: nextSessionQuestion.question.id,
        questionText: nextSessionQuestion.question.text,
        maxDuration: 300, // Default 5 minutes for template questions
      };
    } else {
      throw new Error("Question data missing for session question");
    }

    // Return question data with ZERO-BASED index
    const index = answeredSessionQuestionIds.size; // Number of already-answered questions
    const total = activeQuestions.length; // Total active questions

    return {
      question: questionData,
      index, // Zero-based: 0, 1, 2, ...
      total, // Total count: if 1 question, total=1
    };
  }


  static async uploadResponse(token: string, videoPath: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { accessToken: token },
      include: {
        sessionQuestions: {
          include: { question: true },
          orderBy: { orderIndex: "asc" },
        },
        responses: true,
      },
    });

    if (!session) {
      throw new Error("Invalid or expired link");
    }

    const answeredSessionQuestionIds = new Set(
      session.responses.map(r => r.sessionQuestionId)
    );

    const nextSessionQuestion = session.sessionQuestions.find(
      sq => !answeredSessionQuestionIds.has(sq.id)
    );

    if (!nextSessionQuestion) {
      throw new Error("No pending question");
    }

    return prisma.interviewResponse.create({
      data: {
        sessionId: session.id,
        sessionQuestionId: nextSessionQuestion.id, // ✅ CORRECT
        videoUrl: videoPath.replace(/\\/g, "/"),
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
      },
    });
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
