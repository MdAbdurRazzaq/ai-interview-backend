import prisma from "../../database/prisma";
import { SessionService } from "../sessions/session.service";

const LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE =
  "This legacy interview flow is disabled while the production interview flow is being stabilized.";
const QUESTIONS_PER_SESSION = 5;

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function getFrontendBaseUrl() {
  return process.env.FRONTEND_BASE_URL || "http://localhost:5174";
}

function buildInterviewLink(accessToken: string) {
  return `${getFrontendBaseUrl()}/interview/start/${accessToken}`;
}

function buildInternalCandidateEmail(candidateId: string) {
  return `candidate-${candidateId}@no-email.local`;
}

async function findInvitationByToken(token: string) {
  return prisma.interviewInvitation.findUnique({
    where: { token },
    include: {
      candidate: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      template: {
        select: {
          id: true,
          title: true,
          description: true,
        },
      },
      session: {
        select: {
          id: true,
          accessToken: true,
          expiresAt: true,
          state: true,
          organizationId: true,
          candidateId: true,
          invitationId: true,
          templateId: true,
        },
      },
    },
  });
}

type PublicInvitationRecord = NonNullable<Awaited<ReturnType<typeof findInvitationByToken>>>;

function serializeInvitationCandidate(candidate: PublicInvitationRecord["candidate"]) {
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
  };
}

function serializeInvitationTemplate(template: PublicInvitationRecord["template"]) {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
  };
}

function serializeInvitationSession(session: PublicInvitationRecord["session"]) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    state: session.state,
    expiresAt: session.expiresAt,
    sessionAccessToken: session.accessToken,
    interviewLink: buildInterviewLink(session.accessToken),
  };
}

function getEffectiveInvitationStatus(invitation: PublicInvitationRecord) {
  if (invitation.status === "REVOKED" || invitation.revokedAt) {
    return "REVOKED";
  }

  if (invitation.status === "COMPLETED" || invitation.session?.state === "SUBMITTED") {
    return "COMPLETED";
  }

  if (invitation.expiresAt < new Date()) {
    return "EXPIRED";
  }

  if (invitation.status === "ACCEPTED" || invitation.session) {
    return "ACCEPTED";
  }

  return invitation.status;
}

function serializeInvitationPreview(invitation: PublicInvitationRecord) {
  const status = getEffectiveInvitationStatus(invitation);

  return {
    id: invitation.id,
    status,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    canAccept: status !== "REVOKED" && status !== "EXPIRED" && status !== "COMPLETED",
    candidate: serializeInvitationCandidate(invitation.candidate),
    template: serializeInvitationTemplate(invitation.template),
    session: serializeInvitationSession(invitation.session),
  };
}

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
    const session = await SessionService.createCanonicalInterviewSession({
      templateId,
      candidateName,
      candidateEmail,
    });

    return {
      interviewLink: buildInterviewLink(session.accessToken),
      expiresAt: session.expiresAt,
    };
  }

  static async getInvitationPreviewByToken(token: string) {
    const invitation = await findInvitationByToken(token);

    if (!invitation) {
      throw createHttpError("Invitation not found", 404);
    }

    const shouldMarkOpened =
      invitation.status === "SENT" &&
      !invitation.revokedAt &&
      invitation.expiresAt >= new Date() &&
      invitation.session?.state !== "SUBMITTED";

    if (!shouldMarkOpened) {
      return serializeInvitationPreview(invitation);
    }

    const openedInvitation = await prisma.interviewInvitation.update({
      where: { id: invitation.id },
      data: { status: "OPENED" },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        template: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
        session: {
          select: {
            id: true,
            accessToken: true,
            expiresAt: true,
            state: true,
            organizationId: true,
            candidateId: true,
            invitationId: true,
            templateId: true,
          },
        },
      },
    });

    return serializeInvitationPreview(openedInvitation);
  }

  static async acceptInvitationByToken(token: string) {
    const invitation = await findInvitationByToken(token);

    if (!invitation) {
      throw createHttpError("Invitation not found", 404);
    }

    const effectiveStatus = getEffectiveInvitationStatus(invitation);

    if (effectiveStatus === "REVOKED") {
      throw createHttpError("Invitation has been revoked", 409);
    }

    if (effectiveStatus === "EXPIRED") {
      throw createHttpError("Invitation has expired", 410);
    }

    if (effectiveStatus === "COMPLETED") {
      throw createHttpError("Invitation has already been completed", 409);
    }

    if (!invitation.candidate) {
      throw createHttpError("Candidate not found", 404);
    }

    if (!invitation.template) {
      throw createHttpError("Template not found", 404);
    }

    let session = invitation.session;
    let created = false;

    if (!session) {
      const candidateEmail = invitation.candidate.email?.trim().toLowerCase() || buildInternalCandidateEmail(invitation.candidate.id);

      try {
        session = await SessionService.createCanonicalInterviewSession({
          organizationId: invitation.organizationId,
          candidateId: invitation.candidate.id,
          invitationId: invitation.id,
          templateId: invitation.template.id,
          candidateName: invitation.candidate.fullName,
          candidateEmail,
        });
        created = true;
      } catch (err: any) {
        const duplicateSessionError =
          err?.message?.includes("already exists for this invitation") ||
          err?.code === "P2002";

        if (!duplicateSessionError) {
          throw err;
        }

        const existingSession = await prisma.interviewSession.findFirst({
          where: { invitationId: invitation.id },
          select: {
            id: true,
            accessToken: true,
            expiresAt: true,
            state: true,
            organizationId: true,
            candidateId: true,
            invitationId: true,
            templateId: true,
          },
        });

        if (!existingSession) {
          throw err;
        }

        session = existingSession;
      }
    }

    const acceptedAt = invitation.acceptedAt || new Date();

    if (invitation.status !== "ACCEPTED" || !invitation.acceptedAt) {
      await prisma.interviewInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt,
        },
      });
    }

    return {
      created,
      invitationId: invitation.id,
      status: "ACCEPTED",
      acceptedAt,
      sessionId: session.id,
      sessionAccessToken: session.accessToken,
      interviewLink: buildInterviewLink(session.accessToken),
      expiresAt: session.expiresAt,
      candidate: serializeInvitationCandidate(invitation.candidate),
      template: serializeInvitationTemplate(invitation.template),
    };
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
