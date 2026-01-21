import { Request, Response } from 'express';
import { AuthService } from './auth.service';

export class AuthController {
  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    try {
      const result = await AuthService.login(email, password);
      return res.json(result);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
  }
}
