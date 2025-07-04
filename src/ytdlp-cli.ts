#!/usr/bin/env node

import { exec } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const cookiesPath = process.env.YTDLP_COOKIES || './cookies.txt';

/**
 * 使用 yt-dlp 下载完整视频
 */
function runYtDlpDownload(youtubeUrl: string) {
  const command = `yt-dlp --cookies "${cookiesPath}" -f best "${youtubeUrl}"`;
  console.log(`🚀 开始下载视频：${youtubeUrl}`);
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ 下载失败：\n${stderr}`);
    } else {
      console.log(`✅ 下载完成：\n${stdout}`);
    }
  });
}

/**
 * 主函数
 */
async function main() {
  const url = process.argv[2];

  if (!url || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
    console.error('❌ 请输入有效的 YouTube 视频链接，例如：');
    console.error('   npx ydl https://www.youtube.com/watch?v=XXXXXX');
    process.exit(1);
  }

  runYtDlpDownload(url);
}

main();