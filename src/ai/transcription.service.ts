import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export function transcribeVideo(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const videoPath = path.join(process.cwd(), videoUrl.replace(/^\//, ''));

    if (!fs.existsSync(videoPath)) {
      return reject(new Error(`Video file not found: ${videoPath}`));
    }

    const baseName = path.basename(videoPath, path.extname(videoPath));
    const dirName = path.dirname(videoPath);

    const wavPath = path.join(dirName, `${baseName}.wav`);
    const transcriptPath = path.join(dirName, `${baseName}.txt`);

    // 1️⃣ Convert video → wav
    const ffmpegCmd = `ffmpeg -y -i "${videoPath}" -ar 16000 -ac 1 "${wavPath}"`;

    exec(ffmpegCmd, (ffmpegErr) => {
      if (ffmpegErr) return reject(ffmpegErr);

      // 2️⃣ Transcribe wav → text (force output directory)
      const whisperCmd =
        `python -m whisper "${wavPath}" ` +
        `--model small ` +
        `--language en ` +
        `--output_format txt ` +
        `--output_dir "${dirName}"`;

      exec(whisperCmd, (whisperErr) => {
        if (whisperErr) return reject(whisperErr);

        if (!fs.existsSync(transcriptPath)) {
          return reject(new Error(`Transcript not found: ${transcriptPath}`));
        }

        const transcript = fs.readFileSync(transcriptPath, 'utf-8').trim();
        resolve(transcript);
      });
    });
  });
}
