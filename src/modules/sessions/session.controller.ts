import { Request, Response } from 'express';
import { SessionService } from './session.service';

export class SessionController {
  // ADMIN creates session
  static async create(req: Request, res: Response) {
    const { templateId, candidateName, candidateEmail } = req.body;

    if (!templateId || !candidateName || !candidateEmail) {
      return res.status(400).json({ message: 'Missing fields' });
    }

    try {
      const session = await SessionService.createSession(
        templateId,
        candidateName,
        candidateEmail
      );

      return res.status(201).json({
        sessionId: session.id,
        accessToken: session.accessToken,
        publicUrl: `${process.env.FRONTEND_APP_URL}/interview/${session.accessToken}`,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to create session' });
    }
  }

  // PUBLIC — candidate fetches interview
  static async getPublic(req: Request, res: Response) {
    const { token } = req.params;

    const session = await SessionService.getByToken(token);

    if (!session) {
      return res.status(404).json({ message: 'Invalid or expired link' });
    }

    if (session.expiresAt < new Date()) {
      return res.status(410).json({ message: 'Interview link expired' });
    }

    return res.json({
      candidateName: session.candidateName,
      state: session.state,
      template: session.template,
    });
  }
}
