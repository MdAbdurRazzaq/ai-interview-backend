import prisma from '../../database/prisma';
import { deriveDecision } from './decision.helper';
import { SessionService } from '../sessions/session.service';

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

      questionText: r.sessionQuestion.question.text,
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
      question: r.sessionQuestion.question.text,
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
