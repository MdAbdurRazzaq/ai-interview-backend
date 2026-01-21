import "express";

declare global {
  namespace Express {
    interface Request {
      file?: any;
      user?: {
        userId: string;
        role: string;
        organizationId: string;
      };
    }
  }
}

export {};
