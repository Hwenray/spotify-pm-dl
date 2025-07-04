import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';

const downloadDir = config.downloadDir;

export async function checkFileExists(artist: string, title: string): Promise<{ exists: boolean; fileName: string }> {
  const fileName = `${artist} - ${title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
  const filePath = path.join(downloadDir, fileName);
  try {
    await fs.access(filePath);
    return { exists: true, fileName };
  } catch {
    return { exists: false, fileName };
  }
}