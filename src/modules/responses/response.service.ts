import prisma from '../../database/prisma';
import { SessionState } from '@prisma/client';

export class ResponseService {
  static async submitResponse(
    sessionId: string,
    sessionQuestionId: string,
    videoUrl: string
  ) {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error('Invalid session');
    }

    if (session.state === SessionState.SUBMITTED) {
      throw new Error('Interview already submitted');
    }

    // Move to IN_PROGRESS on first answer
    if (session.state === SessionState.INVITED) {
      await prisma.interviewSession.update({
        where: { id: sessionId },
        data: { state: SessionState.IN_PROGRESS },
      });
    }

    return prisma.interviewResponse.create({
      data: {
        sessionId,
        sessionQuestionId,
        videoUrl,
      },
    });
  }
}
