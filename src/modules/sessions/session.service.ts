import prisma from '../../database/prisma';
import crypto from 'crypto';
import { ALLOWED_TRANSITIONS, SessionState } from './session.state';

const LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE =
  'This legacy interview flow is disabled while the production interview flow is being stabilized.';

export interface CanonicalInterviewSessionInput {
  templateId: string;
  candidateName: string;
  candidateEmail: string;
  organizationId?: string;
  candidateId?: string;
  invitationId?: string;
}

export class SessionService {
  static async createCanonicalInterviewSession(
    input: CanonicalInterviewSessionInput
  ) {
    const candidateName = input.candidateName.trim();
    const candidateEmail = input.candidateEmail.trim().toLowerCase();

    if (!candidateName) {
      throw new Error('candidateName is required');
    }

    if (!candidateEmail) {
      throw new Error('candidateEmail is required');
    }

    const accessToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return prisma.$transaction(async (tx) => {
      const template = await tx.interviewTemplate.findUnique({
        where: { id: input.templateId },
        include: {
          questions: { orderBy: { orderIndex: 'asc' } },
        },
      });

      if (!template) {
        throw new Error('Invalid or missing interview template');
      }

      const organizationId = input.organizationId ?? template.organizationId;

      if (!organizationId) {
        throw new Error('Template is not linked to an organization');
      }

      if (
        input.organizationId &&
        template.organizationId &&
        input.organizationId !== template.organizationId
      ) {
        throw new Error('Template does not belong to the specified organization');
      }

      const activeSessionWhere = input.invitationId
        ? {
            invitationId: input.invitationId,
            expiresAt: { gt: new Date() },
          }
        : input.candidateId
        ? {
            candidateId: input.candidateId,
            expiresAt: { gt: new Date() },
          }
        : {
            candidateEmail,
            expiresAt: { gt: new Date() },
          };

      const existingSession = await tx.interviewSession.findFirst({
        where: activeSessionWhere,
      });

      if (existingSession) {
        const duplicateMessage = input.invitationId
          ? 'An active interview session already exists for this invitation'
          : input.candidateId
          ? 'An active interview session already exists for this candidate'
          : 'An active interview session already exists for this email address';

        throw new Error(duplicateMessage);
      }

      let lockedQuestions: {
        questionId: string | null;
        questionBankId: string | null;
        orderIndex: number;
      }[];

      if (template.questions.length > 0) {
        lockedQuestions = template.questions.map((question) => ({
          questionId: question.id,
          questionBankId: null,
          orderIndex: question.orderIndex,
        }));
      } else {
        const bankQuestions = await tx.questionBank.findMany({
          where: {
            organizationId,
            isActive: true,
          },
          orderBy: { createdAt: 'asc' },
        });

        if (bankQuestions.length === 0) {
          throw new Error(
            'Template has no questions and no active QuestionBank entries found'
          );
        }

        lockedQuestions = bankQuestions.map((question, index) => ({
          questionId: null,
          questionBankId: question.id,
          orderIndex: index,
        }));
      }

      const uniqueKey = new Set(
        lockedQuestions.map((question) => question.questionId ?? question.questionBankId)
      );

      if (uniqueKey.size !== lockedQuestions.length) {
        throw new Error('Session creation aborted: duplicate questions detected');
      }

      const session = await tx.interviewSession.create({
        data: {
          organizationId,
          templateId: template.id,
          candidateId: input.candidateId,
          invitationId: input.invitationId,
          candidateName,
          candidateEmail,
          accessToken,
          expiresAt,
          state: 'INVITED',
        },
      });

      await tx.sessionQuestion.createMany({
        data: lockedQuestions.map((question) => ({
          sessionId: session.id,
          orderIndex: question.orderIndex,
          questionId: question.questionId,
          questionBankId: question.questionBankId,
        })),
      });

      const count = await tx.sessionQuestion.count({
        where: { sessionId: session.id },
      });

      if (count !== lockedQuestions.length) {
        throw new Error(
          `SessionQuestion mismatch: expected ${lockedQuestions.length}, got ${count}`
        );
      }

      return session;
    });
  }

  /* =========================================
     TEMPLATE-BASED SESSION (EXISTING)
  ========================================= */
  static async createSession(
    templateId: string,
    candidateName: string,
    candidateEmail: string
  ) {
    throw new Error(LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE);
  }

  /* =========================================
     GET SESSION BY ACCESS TOKEN
  ========================================= */
  static async getByToken(token: string) {
    return prisma.interviewSession.findUnique({
      where: { accessToken: token },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        sessionQuestions: {
          include: {
            question: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  /* =========================================
     PERSONALIZED SESSION (NEW)
  ========================================= */
  static async createPersonalizedSession(params: {
    organizationId: string;
    candidateName: string;
    candidateEmail: string;
    interviewTitle: string;
    questionIds: string[];
    expiresInHours?: number;
  }) {
    throw new Error(LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE);
  }


  /* =========================================
     SESSION STATE TRANSITIONS
  ========================================= */
  static async transitionState(
    sessionId: string,
    from: SessionState,
    to: SessionState
  ) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new Error(`Invalid state transition: ${from} → ${to}`);
    }

    return prisma.interviewSession.update({
      where: { id: sessionId },
      data: { state: to as any },
    });
  }
}
