import "express";
import type { Multer } from "multer";

declare global {
  namespace Express {
    interface Request {
      file?: Multer.File;
      user?: {
        userId: string;
        role: string;
        organizationId: string;
      };
    }
  }
}

export {};
