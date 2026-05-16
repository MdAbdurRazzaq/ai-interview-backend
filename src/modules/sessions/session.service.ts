import prisma from '../../database/prisma';
import crypto from 'crypto';
import { ALLOWED_TRANSITIONS, SessionState } from './session.state';

const LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE =
  'This legacy interview flow is disabled while the production interview flow is being stabilized.';

export class SessionService {
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
