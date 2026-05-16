import { Request, Response } from 'express';
import { SessionService } from './session.service';

const LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE =
  'This legacy interview flow is disabled while the production interview flow is being stabilized.';

export class SessionController {
  // ADMIN creates session
  static async create(req: Request, res: Response) {
    return res.status(410).json({
      message: LEGACY_INTERVIEW_FLOW_DISABLED_MESSAGE,
    });
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
