import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request } from "express";

const uploadDir = path.join(process.cwd(), "uploads/videos");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (
    _req: Request,
    _file: any,
    cb: (error: Error | null, destination: string) => void
  ) => {
    cb(null, "uploads/");
  },

  filename: (
    _req: Request,
    file: any,
    cb: (error: Error | null, filename: string) => void
  ) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// ✅ THIS is what you import elsewhere
export const VideoUpload = multer({ storage });

export const videoUpload = VideoUpload;

export const upload = VideoUpload;
