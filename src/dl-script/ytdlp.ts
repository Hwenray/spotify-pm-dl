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

/**
 * 使用 ffmpeg 为已有 mp3 文件写入 ID3v2.4 UTF-8 标签与嵌入封面。
 * 注意：需系统安装 ffmpeg 且在 PATH 中。
 */
export async function writeId3v24Utf8Tags(
  inputMp3Path: string,
  outputMp3Path: string,
  meta: {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    date?: string; // YYYY or YYYY-MM-DD
    track?: string; // "1/10" 形式
    disc?: string;  // "1/2" 形式
  },
  coverImageUrl?: string
): Promise<void> {
  // 如果有封面URL，先尝试写入带封面的版本，失败则回退到无封面版本
  if (coverImageUrl) {
    try {
      await writeId3TagsWithCover(inputMp3Path, outputMp3Path, meta, coverImageUrl);
      return;
    } catch (error: any) {
      console.log(`封面嵌入失败，回退到无封面模式: ${error.message}`);
      // 继续执行无封面版本
    }
  }

  // 无封面版本或封面失败后的回退
  return writeId3TagsWithoutCover(inputMp3Path, outputMp3Path, meta);
}

/**
 * 写入带封面的ID3标签
 */
async function writeId3TagsWithCover(
  inputMp3Path: string,
  outputMp3Path: string,
  meta: any,
  coverImageUrl: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];
    args.push('-y');
    args.push('-i', inputMp3Path);
    args.push('-i', coverImageUrl);

    // 添加网络超时和重试参数
    args.push('-timeout', '10000000'); // 10秒超时
    args.push('-reconnect', '1');
    args.push('-reconnect_streamed', '1');
    args.push('-reconnect_delay_max', '2');

    // 元数据
    if (meta.title) args.push('-metadata', `title=${meta.title}`);
    if (meta.artist) args.push('-metadata', `artist=${meta.artist}`);
    if (meta.album) args.push('-metadata', `album=${meta.album}`);
    if (meta.albumArtist) args.push('-metadata', `album_artist=${meta.albumArtist}`);
    if (meta.date) args.push('-metadata', `date=${meta.date}`);
    if (meta.track) args.push('-metadata', `track=${meta.track}`);
    if (meta.disc) args.push('-metadata', `disc=${meta.disc}`);

    // 封面映射
    args.push('-map', '0:a');
    args.push('-map', '1:v');
    args.push('-c:a', 'copy');
    args.push('-c:v', 'mjpeg');
    args.push('-id3v2_version', '4');
    args.push('-metadata:s:v', 'title=Album cover');
    args.push('-metadata:s:v', 'comment=Cover (front)');
    args.push('-disposition:v', 'attached_pic');
    args.push('-f', 'mp3');
    args.push(outputMp3Path);

    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

    let err = '';
    if (child.stderr) {
      child.stderr.on('data', (d) => (err += d.toString()));
    }

    child.on('error', (e) => {
      reject(new Error(`无法启动 ffmpeg：${e.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(err || `ffmpeg 退出码 ${code}`));
    });
  });
}

/**
 * 写入无封面的ID3标签
 */
async function writeId3TagsWithoutCover(
  inputMp3Path: string,
  outputMp3Path: string,
  meta: any
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];
    args.push('-y');
    args.push('-i', inputMp3Path);

    // 元数据
    if (meta.title) args.push('-metadata', `title=${meta.title}`);
    if (meta.artist) args.push('-metadata', `artist=${meta.artist}`);
    if (meta.album) args.push('-metadata', `album=${meta.album}`);
    if (meta.albumArtist) args.push('-metadata', `album_artist=${meta.albumArtist}`);
    if (meta.date) args.push('-metadata', `date=${meta.date}`);
    if (meta.track) args.push('-metadata', `track=${meta.track}`);
    if (meta.disc) args.push('-metadata', `disc=${meta.disc}`);

    args.push('-c', 'copy');
    args.push('-id3v2_version', '4');
    args.push('-f', 'mp3');
    args.push(outputMp3Path);

    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

    let err = '';
    if (child.stderr) {
      child.stderr.on('data', (d) => (err += d.toString()));
    }

    child.on('error', (e) => {
      reject(new Error(`无法启动 ffmpeg：${e.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(err || `ffmpeg 退出码 ${code}`));
    });
  });
}

