import prisma from '../database/prisma';
import { transcribeVideo } from './transcription.service';
import { evaluateAnswer } from './evaluation.service';

export async function processInterviewResponse(responseId: string) {
  try {
    // 1️⃣ Mark response as PROCESSING
    await prisma.interviewResponse.update({
      where: { id: responseId },
      data: { status: 'PROCESSING' },
    });

    // 2️⃣ Load response with correct relations
    const response = await prisma.interviewResponse.findUnique({
      where: { id: responseId },
      include: {
        sessionQuestion: {
          include: {
            question: true, // QuestionBank
          },
        },
        session: true,
      },
    });

    if (!response) {
      throw new Error('Response not found');
    }

    const questionText =
      response.sessionQuestion.question.questionText;

    const maxDuration =
      response.sessionQuestion.question.maxDuration;

    // 3️⃣ Transcription
    const transcript = await transcribeVideo(response.videoUrl);

    // 4️⃣ AI Evaluation
    const { score, feedback } = await evaluateAnswer(
      questionText,
      transcript,
      maxDuration
    );

    // 5️⃣ Persist AI results
    await prisma.interviewResponse.update({
      where: { id: responseId },
      data: {
        transcript,
        aiScore: score,
        aiFeedback: feedback,
        status: 'DONE',
        errorMessage: null,
      },
    });

  } catch (err: any) {
    console.error('AI PROCESSING FAILED:', err);

    // 🔴 Never throw — always persist failure
    await prisma.interviewResponse.update({
      where: { id: responseId },
      data: {
        status: 'FAILED',
        errorMessage: err?.message || 'AI processing failed',
      },
    });
  }
}
