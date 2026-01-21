import { exec } from 'child_process';
import path from 'path';

export function extractAudio(videoUrl: string): Promise<string> {
  const videoPath = path.join(
    process.cwd(),
    videoUrl.replace('/', '')
  );

  const audioPath = videoPath.replace(/\.[^/.]+$/, '.wav');

  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH;

    if (!ffmpegPath) {
      return reject(new Error('FFMPEG_PATH not set'));
    }

    const cmd = `"${ffmpegPath}" -y -i "${videoPath}" -ar 16000 -ac 1 "${audioPath}"`;

    exec(cmd, (error) => {
      if (error) reject(error);
      else resolve(audioPath);
    });
  });
}
