import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { processInterviewResponse } from '../../ai/ai.processor';

export class ResponseController {
  /**
   * Upload a video response for a question
   * POST /responses/upload
   */
  static async upload(req: Request, res: Response) {
    try {
      const { sessionId, questionId } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: 'Video file is required' });
      }

      if (!sessionId || !questionId) {
        return res
          .status(400)
          .json({ message: 'sessionId and questionId are required' });
      }

      // Ensure session exists and is not submitted
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      if (session.state === 'SUBMITTED') {
        return res
          .status(400)
          .json({ message: 'Interview already submitted' });
      }

      const videoUrl = `/uploads/videos/${req.file.filename}`;

      // Save response
      const responseRecord = await prisma.interviewResponse.create({
        data: {
          sessionId,
          questionId,
          videoUrl,
          status: 'PENDING',
        },
      });

      // 🔥 Fire async AI processing (do NOT await)
      processInterviewResponse(responseRecord.id);

      return res.status(201).json({
        message: 'Response uploaded successfully',
        responseId: responseRecord.id,
      });
    } catch (err) {
      console.error('UPLOAD RESPONSE ERROR:', err);
      return res.status(500).json({ message: 'Failed to upload response' });
    }
  }

  /**
   * Get AI processing status of a response
   * GET /responses/:id/status
   */
  static async getStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const response = await prisma.interviewResponse.findUnique({
        where: { id },
        select: {
          status: true,
          transcript: true,
          aiScore: true,
          aiFeedback: true,
          errorMessage: true,
        },
      });

      if (!response) {
        return res.status(404).json({ message: 'Response not found' });
      }

      return res.json(response);
    } catch (err) {
      console.error('GET STATUS ERROR:', err);
      return res.status(500).json({ message: 'Failed to fetch status' });
    }
  }

  /**
   * Submit interview (lock session)
   * POST /responses/session/:token/submit
   */
  static async submitInterview(req: Request, res: Response) {
    try {
      const { token } = req.params;

      const session = await prisma.interviewSession.findUnique({
        where: { accessToken: token },
      });

      if (!session) {
        return res.status(404).json({ message: 'Invalid or expired link' });
      }

      if (session.state === 'SUBMITTED') {
        return res
          .status(400)
          .json({ message: 'Interview already submitted' });
      }

      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { state: 'SUBMITTED' },
      });

      return res.json({ message: 'Interview submitted successfully' });
    } catch (err) {
      console.error('SUBMIT INTERVIEW ERROR:', err);
      return res.status(500).json({ message: 'Submission failed' });
    }
  }

  static async process(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await processInterviewResponse(id);

      return res.json({ message: 'AI processing started' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
}
