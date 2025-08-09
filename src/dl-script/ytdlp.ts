import { spawn } from 'child_process';
import path from 'path';

/**
 * 使用 yt-dlp 通过搜索关键词下载音频为 MP3。
 * - 利用 yt-dlp 的 ytsearch1: 功能选取第一个搜索结果
 * - 输出为指定的绝对路径（包含 .mp3 扩展名）
 */
export async function downloadAudioFromSearch(query: string, outputFilePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cookiesPath = process.env.YTDLP_COOKIES;

    const args: string[] = [];
    if (cookiesPath && cookiesPath.trim().length > 0) {
      args.push('--cookies', cookiesPath);
    }

    args.push(
      '-x',
      '--audio-format', 'mp3',
      '--no-playlist',
      '--force-overwrites',
      // 避免产生 .part 文件影响体验（可选）
      '--no-part',
      '-o', outputFilePath,
      `ytsearch1:${query}`
    );

    const child = spawn('yt-dlp', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });

    let stderrBuffer = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
      });
    }

    child.on('error', (err) => {
      reject(new Error(`无法启动 yt-dlp，请确认已安装并在 PATH 中可用。原始错误：${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const msg = stderrBuffer.trim() || `yt-dlp 退出码 ${code}`;
        reject(new Error(msg));
      }
    });
  });
}

export function buildAbsolutePath(dir: string, fileName: string): string {
  return path.resolve(dir, fileName);
}

