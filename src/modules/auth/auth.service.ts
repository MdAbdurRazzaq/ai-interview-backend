import prisma from '../../database/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export class AuthService {
  static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // 🔒 Ensure user is linked to an organization
    if (!user.organizationId) {
      throw new Error(
        'User is not linked to an organization. Contact support.'
      );
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role.toUpperCase(),
        organizationId: user.organizationId, // ✅ FIX
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }
}
