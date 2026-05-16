import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { processInterviewResponse } from '../../ai/ai.processor';

const LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE =
  'This legacy interview flow is disabled while the production interview flow is being stabilized.';

function setNoCacheHeaders(res: Response) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  });
}

export class ResponseController {
  /**
   * Upload a video response for a question
   * POST /responses/upload
   */
  static async upload(req: Request, res: Response) {
    setNoCacheHeaders(res);
    return res.status(410).json({
      message: LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE,
    });
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
    setNoCacheHeaders(res);
    return res.status(410).json({
      message: LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE,
    });
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
