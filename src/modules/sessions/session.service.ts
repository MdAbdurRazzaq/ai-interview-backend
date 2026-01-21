import prisma from '../../database/prisma';
import crypto from 'crypto';
import { ALLOWED_TRANSITIONS, SessionState } from './session.state';

export class SessionService {
  /* =========================================
     TEMPLATE-BASED SESSION (EXISTING)
  ========================================= */
  static async createSession(
    templateId: string,
    candidateName: string,
    candidateEmail: string
  ) {
    const token = crypto.randomBytes(32).toString('hex');

    return prisma.interviewSession.create({
      data: {
        templateId,
        candidateName,
        candidateEmail,
        state: 'INVITED',
        accessToken: token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
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
    const {
      organizationId,
      candidateName,
      candidateEmail,
      interviewTitle,
      questionIds,
      expiresInHours = 48,
    } = params;

    console.log('[CREATE PERSONALIZED SESSION] Received params:', {
      organizationId,
      candidateName,
      candidateEmail,
      interviewTitle,
      questionIds,
      expiresInHours,
    });

    if (!questionIds || questionIds.length === 0) {
      throw new Error('At least one question is required');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000
    );

    return prisma.$transaction(async (tx) => {
      console.log('[CREATE PERSONALIZED SESSION] Fetching QuestionBank questions:', questionIds);

      // 0️⃣ Fetch QuestionBank questions (these are the source)
      const qbQuestions = await tx.questionBank.findMany({
        where: {
          id: { in: questionIds },
          organizationId,
          isActive: true,
        },
      });

      if (qbQuestions.length !== questionIds.length) {
        throw new Error(
          `Only ${qbQuestions.length}/${questionIds.length} questions found and active`
        );
      }

      console.log('[CREATE PERSONALIZED SESSION] ✓ All QuestionBank questions found and active');

      // 1️⃣ Create session WITHOUT template
      const data: any = {
        organizationId,
        candidateName,
        candidateEmail,
        accessToken: token,
        state: 'INVITED',
        expiresAt,
        templateId: null, // allowed for personalized sessions
      };
      // assign new field added via migration (types may lag until prisma generate)
      data.interviewTitle = interviewTitle;

      console.log('[CREATE PERSONALIZED SESSION] Creating session with data:', data);

      const session = await tx.interviewSession.create({
        data,
      });

      console.log('[CREATE PERSONALIZED SESSION] Session created:', session.id);

      // 2️⃣ Copy QuestionBank questions to InterviewQuestion records (NO templateId needed anymore)
      const interviewQuestionsData = qbQuestions.map((q, index) => ({
        text: q.questionText, // Copy text from QuestionBank
        orderIndex: index,
        templateId: null, // ✓ templateId is now optional for personalized sessions
      }));

      console.log('[CREATE PERSONALIZED SESSION] Creating InterviewQuestion records:', interviewQuestionsData.length);

      const interviewQuestions = await tx.interviewQuestion.createMany({
        data: interviewQuestionsData,
      });

      console.log('[CREATE PERSONALIZED SESSION] InterviewQuestion records created');

      // 3️⃣ Fetch the created InterviewQuestion records to get their IDs
      const createdInterviewQuestions = await tx.interviewQuestion.findMany({
        where: {
          templateId: null, // Find the ones we just created without templates
          text: { in: qbQuestions.map(q => q.questionText) },
        },
        orderBy: { orderIndex: 'asc' },
      });

      console.log('[CREATE PERSONALIZED SESSION] Created interview questions IDs:', createdInterviewQuestions.map(q => q.id));

      // 4️⃣ Create SessionQuestion records referencing InterviewQuestion.id
      const sessionQuestions = createdInterviewQuestions.map((q, index) => ({
        sessionId: session.id,
        questionId: q.id, // ✓ Reference InterviewQuestion.id, NOT QuestionBank.id
        orderIndex: index,
      }));

      console.log('[CREATE PERSONALIZED SESSION] Creating SessionQuestion records:', sessionQuestions.length);

      await tx.sessionQuestion.createMany({
        data: sessionQuestions,
      });

      console.log('[CREATE PERSONALIZED SESSION] ✓ SessionQuestions created successfully');

      return session;
    });
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
