// track.ts
import fs from 'fs/promises';
import path from 'path';
import { fetchDownloadLink } from './dl-script/dl.js';
import { addToAria2 } from './dl-script/aria2.js';
import { FailedTrack } from './types.js';
import { config } from './config.js';

const downloadDir = config.downloadDir;
const failedTracksFile = path.join(downloadDir, 'failed_tracks.json');
const maxRetries = 5;
const retryDelay = 1000;

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '');
}

async function checkFileExists(artist: string, title: string): Promise<{ exists: boolean; fileName: string }> {
  const fileName = sanitizeFileName(`${artist} - ${title}.mp3`);
  const filePath = path.join(downloadDir, fileName);
  try {
    await fs.access(filePath);
    return { exists: true, fileName };
  } catch {
    return { exists: false, fileName };
  }
}

async function saveFailedTrack(trackUrl: string, errorMessage: string): Promise<void> {
  try {
    let failedTracks: FailedTrack[] = [];
    try {
      const data = await fs.readFile(failedTracksFile, 'utf8');
      failedTracks = JSON.parse(data);
    } catch {
      // 初始化为空数组
    }

    failedTracks.push({
      url: trackUrl,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    await fs.writeFile(failedTracksFile, JSON.stringify(failedTracks, null, 2));
    console.log(`已记录失败歌曲：${trackUrl}`);
  } catch (error: any) {
    console.error(`写入失败记录失败：${error.message}`);
  }
}

export async function processTrack(trackUrl: string, index: number, total: number): Promise<void> {
  console.log(`正在处理第 ${index + 1}/${total} 首：${trackUrl}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await fetchDownloadLink(trackUrl);
      if (!data || !data.success || !data.data) throw new Error('API 无下载链接');

      const { downloadLink, artist, title } = data.data;

      if (!downloadLink) throw new Error('下载链接不存在');

      const { exists, fileName } = await checkFileExists(artist, title);
      if (exists) {
        console.log(`存在，跳过：${fileName}`);
        return;
      }

      console.log(`下载链接：${downloadLink}`);
      console.log(`文件名：${fileName}`);
      await addToAria2(downloadLink, fileName);
      return;
    } catch (error: any) {
      const msg = error.response
        ? `HTTP ${error.response.status}: ${error.message}`
        : error.message;
      console.error(`尝试 ${attempt}/${maxRetries} 失败：${msg}`);

      if (attempt === maxRetries) {
        await saveFailedTrack(trackUrl, msg);
      } else {
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  }
}