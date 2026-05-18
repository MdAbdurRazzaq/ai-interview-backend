import crypto from 'crypto';
import prisma from '../../database/prisma';
import { deriveDecision } from './decision.helper';
import { SessionService } from '../sessions/session.service';

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

const DEFAULT_INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function getFrontendBaseUrl() {
  return process.env.FRONTEND_BASE_URL || 'http://localhost:5174';
}

function buildInvitationLink(token: string) {
  return `${getFrontendBaseUrl()}/invite/${token}`;
}

function parseInvitationExpiry(expiresAt?: string | Date | null) {
  if (!expiresAt) {
    return new Date(Date.now() + DEFAULT_INVITATION_EXPIRY_MS);
  }

  const parsed = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError('expiresAt must be a valid date', 400);
  }

  return parsed;
}

function serializeInvitation(invitation: any, includeToken = false) {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    candidateId: invitation.candidateId,
    templateId: invitation.templateId,
    status: invitation.status,
    sentAt: invitation.sentAt,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
    ...(includeToken
      ? {
          token: invitation.token,
          publicInvitationLink: buildInvitationLink(invitation.token),
        }
      : {}),
    candidate: invitation.candidate
      ? {
          id: invitation.candidate.id,
          fullName: invitation.candidate.fullName,
          email: invitation.candidate.email,
        }
      : null,
    template: invitation.template
      ? {
          id: invitation.template.id,
          title: invitation.template.title,
        }
      : null,
    session: invitation.session
      ? {
          id: invitation.session.id,
          interviewTitle: invitation.session.interviewTitle,
          state: invitation.session.state,
          source: invitation.session.source,
          createdAt: invitation.session.createdAt,
          expiresAt: invitation.session.expiresAt,
          decisionAt: invitation.session.decisionAt,
          finalScore: invitation.session.finalScore,
          finalDecision: invitation.session.finalDecision,
        }
      : null,
  };
}

export class AdminService {
  // 🔹 List sessions for an organization
  static async listSessions(organizationId: string) {
    return prisma.interviewSession.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: { title: true },
        },
      },
    });
  }

  static async listCandidates(
    organizationId: string,
    filters?: {
      search?: string;
    }
  ) {
    const search = filters?.search?.trim();

    return prisma.candidate.findMany({
      where: {
        organizationId,
        ...(search
          ? {
              OR: [
                {
                  fullName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  emailNormalized: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            sessions: true,
            invitations: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createCandidate(
    organizationId: string,
    params: {
      fullName: string;
      email?: string | null;
    }
  ) {
    const fullName = params.fullName.trim();

    if (!fullName) {
      throw createHttpError('fullName is required', 400);
    }

    const email =
      typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';

    if (email) {
      const uniqueWhere = {
        organizationId_emailNormalized: {
          organizationId,
          emailNormalized: email,
        },
      };

      const existingCandidate = await prisma.candidate.findUnique({
        where: uniqueWhere,
      });

      if (existingCandidate) {
        return {
          candidate: existingCandidate,
          created: false,
        };
      }

      try {
        const candidate = await prisma.candidate.create({
          data: {
            organizationId,
            fullName,
            email,
            emailNormalized: email,
          },
        });

        return {
          candidate,
          created: true,
        };
      } catch (error: any) {
        if (error?.code === 'P2002') {
          const candidate = await prisma.candidate.findUnique({
            where: uniqueWhere,
          });

          if (candidate) {
            return {
              candidate,
              created: false,
            };
          }
        }

        throw error;
      }
    }

    const candidate = await prisma.candidate.create({
      data: {
        organizationId,
        fullName,
        email: null,
        emailNormalized: null,
      },
    });

    return {
      candidate,
      created: true,
    };
  }

  static async getCandidate(organizationId: string, candidateId: string) {
    return prisma.candidate.findFirst({
      where: {
        id: candidateId,
        organizationId,
      },
      include: {
        _count: {
          select: {
            sessions: true,
            invitations: true,
          },
        },
        sessions: {
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            interviewTitle: true,
            state: true,
            source: true,
            createdAt: true,
            expiresAt: true,
            decisionAt: true,
            finalScore: true,
            finalDecision: true,
            templateId: true,
            invitationId: true,
          },
        },
        invitations: {
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            templateId: true,
            status: true,
            sentAt: true,
            expiresAt: true,
            acceptedAt: true,
            revokedAt: true,
            createdAt: true,
            session: {
              select: {
                id: true,
                state: true,
              },
            },
          },
        },
      },
    });
  }

  static async listInvitations(
    organizationId: string,
    filters?: {
      status?: string;
    }
  ) {
    const status = filters?.status?.trim();

    const invitations = await prisma.interviewInvitation.findMany({
      where: {
        organizationId,
        ...(status ? { status: status as any } : {}),
      },
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
          },
        },
        session: {
          select: {
            id: true,
            interviewTitle: true,
            state: true,
            source: true,
            createdAt: true,
            expiresAt: true,
            decisionAt: true,
            finalScore: true,
            finalDecision: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return invitations.map((invitation) => serializeInvitation(invitation));
  }

  static async createInvitation(
    organizationId: string,
    params: {
      candidateId: string;
      templateId: string;
      expiresAt?: string | Date | null;
    }
  ) {
    const expiresAt = parseInvitationExpiry(params.expiresAt);

    return prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: {
          id: params.candidateId,
          organizationId,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      });

      if (!candidate) {
        throw createHttpError('Candidate not found', 404);
      }

      const template = await tx.interviewTemplate.findFirst({
        where: {
          id: params.templateId,
          organizationId,
        },
        select: {
          id: true,
          title: true,
        },
      });

      if (!template) {
        throw createHttpError('Template not found', 404);
      }

      const token = crypto.randomBytes(32).toString('hex');

      const invitation = await tx.interviewInvitation.create({
        data: {
          organizationId,
          candidateId: candidate.id,
          templateId: template.id,
          token,
          status: 'DRAFT',
          expiresAt,
        },
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
            },
          },
          session: {
            select: {
              id: true,
              interviewTitle: true,
              state: true,
              source: true,
              createdAt: true,
              expiresAt: true,
              decisionAt: true,
              finalScore: true,
              finalDecision: true,
            },
          },
        },
      });

      return serializeInvitation(invitation, true);
    });
  }

  static async getInvitation(organizationId: string, invitationId: string) {
    const invitation = await prisma.interviewInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
      },
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
          },
        },
        session: {
          select: {
            id: true,
            interviewTitle: true,
            state: true,
            source: true,
            createdAt: true,
            expiresAt: true,
            decisionAt: true,
            finalScore: true,
            finalDecision: true,
          },
        },
      },
    });

    if (!invitation) {
      return null;
    }

    return serializeInvitation(invitation, true);
  }

  static async revokeInvitation(organizationId: string, invitationId: string) {
    const invitation = await prisma.interviewInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
      },
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
          },
        },
        session: {
          select: {
            id: true,
            interviewTitle: true,
            state: true,
            source: true,
            createdAt: true,
            expiresAt: true,
            decisionAt: true,
            finalScore: true,
            finalDecision: true,
          },
        },
      },
    });

    if (!invitation) {
      return null;
    }

    if (
      invitation.status === 'COMPLETED' ||
      invitation.session?.state === 'SUBMITTED'
    ) {
      throw createHttpError('Completed invitations cannot be revoked', 409);
    }

    if (invitation.status === 'REVOKED') {
      return serializeInvitation(invitation, true);
    }

    const updated = await prisma.interviewInvitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
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
          },
        },
        session: {
          select: {
            id: true,
            interviewTitle: true,
            state: true,
            source: true,
            createdAt: true,
            expiresAt: true,
            decisionAt: true,
            finalScore: true,
            finalDecision: true,
          },
        },
      },
    });

    return serializeInvitation(updated, true);
  }

  // 🔹 Get all responses for a session (reviewer view)
  static async getSessionResponses(
    organizationId: string,
    sessionId: string
  ) {
    const responses = await prisma.interviewResponse.findMany({
      where: {
        sessionId,
        session: {
          organizationId,
        },
      },
      include: {
        sessionQuestion: {
          include: {
            question: true, // QuestionBank
          },
        },
      },
      orderBy: {
        sessionQuestion: {
          orderIndex: 'asc',
        },
      },
    });

    return responses.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      videoUrl: r.videoUrl,

      questionText: r.sessionQuestion.question?.text || '',
      orderIndex: r.sessionQuestion.orderIndex,

      transcript: r.transcript,
      aiScore: r.aiScore,
      aiFeedback: r.aiFeedback,

      reviewerScore: r.reviewerScore,
      reviewerNotes: r.reviewerNotes,
      reviewedAt: r.reviewedAt,

      finalScore: r.reviewerScore ?? r.aiScore,
      decision: deriveDecision(r.aiScore, r.reviewerScore, r.status),

      status: r.status,
      createdAt: r.createdAt,
    }));
  }


  // 🔹 Reviewer overrides AI
  static async reviewResponse(
    responseId: string,
    reviewerScore?: number,
    reviewerNotes?: string
  ) {
    try {
      return await prisma.interviewResponse.update({
        where: { id: responseId },
        data: {
          reviewerScore,
          reviewerNotes,
          reviewedAt: new Date(),
        },
      });
    } catch (err) {
      console.error('❌ ADMIN SERVICE ERROR:', err);
      throw err;
    }
  }

  // 🔹 List responses with operational filters
  static async listResponses(
    organizationId: string,
    filters: {
      status?: string;
      reviewed?: boolean;
    }
  ) {
    return prisma.interviewResponse.findMany({
      where: {
        status: filters.status as any,
        reviewedAt: filters.reviewed ? { not: null } : undefined,
        session: {
          organizationId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 🔹 Export session results (CSV / reporting ready)
  static async exportSession(
    organizationId: string,
    sessionId: string
  ) {
    const responses = await prisma.interviewResponse.findMany({
      where: {
        sessionId,
        session: {
          organizationId,
        },
      },
      include: {
        sessionQuestion: {
          include: {
            question: {
              select: { text: true },
            },
          },
        },
        session: {
          select: {
            candidateName: true,
            candidateEmail: true,
          },
        },
      },
      orderBy: {
        sessionQuestion: { orderIndex: 'asc' },
      },
    });

    return responses.map((r) => ({
      candidateName: r.session.candidateName,
      candidateEmail: r.session.candidateEmail,
      question: r.sessionQuestion.question?.text || '',
      transcript: r.transcript,
      aiScore: r.aiScore,
      reviewerScore: r.reviewerScore,
      finalScore: r.reviewerScore ?? r.aiScore,
      decision: deriveDecision(r.aiScore, r.reviewerScore, r.status),
      reviewerNotes: r.reviewerNotes,
    }));
  }

  /* ======================================================
     🧠 QUESTION BANK (ADMIN)
  ====================================================== */

  static async createQuestion(params: {
    organizationId: string;
    createdBy: string;
    questionText: string;
    category: any;
    maxDuration: number;
    difficulty?: string;
  }) {
    const {
      organizationId,
      createdBy,
      questionText,
      category,
      maxDuration,
      difficulty,
    } = params;

    return prisma.questionBank.create({
      data: {
        organizationId,
        createdBy,
        questionText,
        category,
        maxDuration,
        difficulty,
      },
    });
  }

  static async listQuestions(
    organizationId: string,
    filters?: {
      category?: any;
      isActive?: boolean;
    }
  ) {
    return prisma.questionBank.findMany({
      where: {
        organizationId,
        category: filters?.category,
        isActive: filters?.isActive,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async toggleQuestionStatus(
    questionId: string,
    isActive: boolean
  ) {
    return prisma.questionBank.update({
      where: { id: questionId },
      data: { isActive },
    });
  }

  /* ======================================================
     🎯 PERSONALIZED INTERVIEW SESSION (ADMIN)
  ====================================================== */

  static async createPersonalizedSession(params: {
    organizationId: string;
    candidateName: string;
    candidateEmail: string;
    interviewTitle: string;
    questionIds: string[];
    expiresInHours?: number;
  }) {
    const { organizationId, questionIds } = params;

    // 🔒 Ensure questions belong to the organization & are active
    const questions = await prisma.questionBank.findMany({
      where: {
        id: { in: questionIds },
        organizationId,
        isActive: true,
      },
    });

    if (questions.length !== questionIds.length) {
      throw new Error(
        'One or more questions are invalid, inactive, or do not belong to this organization'
      );
    }

    return SessionService.createPersonalizedSession(params);
  }
}
