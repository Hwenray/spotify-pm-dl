#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import ProgressBar from 'progress';
import { getAccessToken, getPlaylistTracks, searchTracks, SearchResult, getTrackInfoFromUrl, getAlbumTracks, getTrackFullInfo, selectAlbumImageUrl } from './src/sp-script/spotify.js';
import { downloadAudioFromSearch, buildAbsolutePath, writeId3v24Utf8Tags } from './src/dl-script/ytdlp.js';
import { config } from './src/config.js';
import { checkFileExists, sanitizePathName, ensureDir } from './src/utils.js';
import fs from 'fs/promises';
import { proposeOriginalMetadata } from './src/metadata/original.js';

dotenv.config();

const program = new Command();
const downloadDir = config.downloadDir;
const retryDelay = 1000;
const maxRetries = 10;

// 统计信息
interface DownloadStats {
  total: number;
  success: number;
  skipped: number;
  failed: number;
}

// 定义全局 stats 变量
let stats: DownloadStats = { total: 0, success: 0, skipped: 0, failed: 0 };

// 美化输出函数
const log = {
  info: (msg: string) => console.log(chalk.blueBright(`ℹ ${msg}`)),
  success: (msg: string) => console.log(chalk.green(`✅ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`⚠ ${msg}`)),
  error: (msg: string) => console.log(chalk.red(`❌ ${msg}`)),
};

let progressBar: ProgressBar | null = null;


// 下载单首歌曲（改为通过 yt-dlp 搜索并抽音轨）
async function downloadTrack(trackUrl: string, index: number, total: number, options?: { scratch?: boolean; original?: boolean }) {
  const spinner = ora({
    text: `[${index + 1}/${total}] 获取元数据并下载: ${trackUrl}`,
    color: 'blue',
  }).start();

  let artist = '未知艺术家';
  let title = '未知标题';

  // 确保下载目录存在
  try {
    await fs.mkdir(downloadDir, { recursive: true });
  } catch {}

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('无法获取 Spotify Token');
      }

      const meta = await getTrackInfoFromUrl(trackUrl, token);
      if (!meta) {
        throw new Error('无法获取单曲元数据');
      }
      artist = meta.artist;
      title = meta.title;

      const fileName = `${artist} - ${title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
      const { exists } = await checkFileExists(artist, title);
      if (exists) {
        spinner.warn(`[${index + 1}/${total}] ${fileName} 已存在，跳过`);
        stats.skipped++;
        return;
      }

      spinner.text = `[${index + 1}/${total}] 使用 yt-dlp 下载: ${fileName}`;
      let absPath = buildAbsolutePath(downloadDir, fileName);
      await downloadAudioFromSearch(`${artist} - ${title}`, absPath);

      // 可选：自动刮削并写入 ID3 标签
      if (options?.scratch) {
        try {
          let full = await getTrackFullInfo(trackUrl, token);
          if (!full) throw new Error('获取完整元数据失败');
          if (options?.original) {
            const proposal = await proposeOriginalMetadata(full);
            if (proposal) {
              const oldDisplay = `${full.artist} - ${full.title}`;
              full = {
                ...full,
                title: proposal.title || full.title,
                artist: proposal.artist || full.artist,
                album: proposal.album || full.album,
                albumArtists: proposal.albumArtist || full.albumArtists,
              };
              const newDisplay = `${full.artist} - ${full.title}`;
              ora().info(`[${index + 1}/${total}] 去英文化：${oldDisplay} -> ${newDisplay}`);
              const newFileName = `${full.artist} - ${full.title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
              const newAbs = buildAbsolutePath(downloadDir, newFileName);
              if (newAbs !== absPath) {
                try { await fs.rename(absPath, newAbs); absPath = newAbs; } catch {}
              }
            } else {
              ora().warn(`[${index + 1}/${total}] 未找到原始名称，保留 Spotify 名称`);
            }
          }
          const cover = selectAlbumImageUrl(full.images, 300) || undefined;
          const taggedPath = absPath;
          const tempOut = absPath + '.tmp.mp3';

          const trackStr = full.totalTracks && full.trackNumber ? `${full.trackNumber}/${full.totalTracks}` : full.trackNumber?.toString();
          const discStr = full.discNumber ? `${full.discNumber}` : undefined;

          await writeId3v24Utf8Tags(absPath, tempOut, {
            title: full.title,
            artist: full.artist,
            album: full.album,
            albumArtist: full.albumArtists,
            date: full.releaseDate,
            track: trackStr,
            disc: discStr,
          }, cover);

          await fs.rename(tempOut, taggedPath);
          spinner.succeed(`[${index + 1}/${total}] 已写入元数据: ${fileName}`);
        } catch (e: any) {
          // 不影响下载成败，仅提示
          ora().warn(`[${index + 1}/${total}] 元数据写入失败，已跳过：${e.message}`);
        }
      } else {
        spinner.succeed(`[${index + 1}/${total}] ${fileName} 下载完成`);
      }
      stats.success++;
      return;
    } catch (error: any) {
      spinner.fail(`[${index + 1}/${total}] 下载失败 (${artist} - ${title}): ${error.message}`);
      if (attempt < maxRetries) {
        spinner.text = `[${index + 1}/${total}] 重试 ${attempt}/${maxRetries}...`;
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
      } else {
        spinner.fail(`[${index + 1}/${total}] 达到最大重试次数，放弃下载`);
        stats.failed++;
        return;
      }
    }
  }
}



// 指定目录下载单曲（用于歌单/专辑子目录）
async function downloadTrackToDir(trackUrl: string, index: number, total: number, targetDir: string, options?: { scratch?: boolean; original?: boolean }) {
  const spinner = ora({
    text: `[${index + 1}/${total}] 获取元数据并下载: ${trackUrl}`,
    color: 'blue',
  }).start();

  let artist = '未知艺术家';
  let title = '未知标题';

  try {
    await ensureDir(targetDir);
  } catch {}

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('无法获取 Spotify Token');

      const meta = await getTrackInfoFromUrl(trackUrl, token);
      if (!meta) throw new Error('无法获取单曲元数据');

      artist = meta.artist;
      title = meta.title;

      const fileName = `${artist} - ${title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
      let filePath = buildAbsolutePath(targetDir, fileName);

      try {
        await fs.access(filePath);
        spinner.warn(`[${index + 1}/${total}] ${fileName} 已存在，跳过`);
        stats.skipped++;
        return;
      } catch {}

      spinner.text = `[${index + 1}/${total}] 使用 yt-dlp 下载: ${fileName}`;
      await downloadAudioFromSearch(`${artist} - ${title}`, filePath);

      if (options?.scratch) {
        try {
          let full = await getTrackFullInfo(trackUrl, token);
          if (!full) throw new Error('获取完整元数据失败');
          if (options?.original) {
            const proposal = await proposeOriginalMetadata(full);
            if (proposal) {
              const oldDisplay = `${full.artist} - ${full.title}`;
              full = {
                ...full,
                title: proposal.title || full.title,
                artist: proposal.artist || full.artist,
                album: proposal.album || full.album,
                albumArtists: proposal.albumArtist || full.albumArtists,
              };
              const newDisplay = `${full.artist} - ${full.title}`;
              ora().info(`[${index + 1}/${total}] 去英文化：${oldDisplay} -> ${newDisplay}`);
              const newFileName = `${full.artist} - ${full.title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
              const newPath = buildAbsolutePath(targetDir, newFileName);
              if (newPath !== filePath) {
                try { await fs.rename(filePath, newPath); filePath = newPath; } catch {}
              }
            } else {
              ora().warn(`[${index + 1}/${total}] 未找到原始名称，保留 Spotify 名称`);
            }
          }
          const cover = selectAlbumImageUrl(full.images, 300) || undefined;
          const tempOut = filePath + '.tmp.mp3';
          const trackStr = full.totalTracks && full.trackNumber ? `${full.trackNumber}/${full.totalTracks}` : full.trackNumber?.toString();
          const discStr = full.discNumber ? `${full.discNumber}` : undefined;

          await writeId3v24Utf8Tags(filePath, tempOut, {
            title: full.title,
            artist: full.artist,
            album: full.album,
            albumArtist: full.albumArtists,
            date: full.releaseDate,
            track: trackStr,
            disc: discStr,
          }, cover);
          await fs.rename(tempOut, filePath);
          spinner.succeed(`[${index + 1}/${total}] 已写入元数据: ${fileName}`);
        } catch (e: any) {
          ora().warn(`[${index + 1}/${total}] 元数据写入失败，已跳过：${e.message}`);
        }
      } else {
        spinner.succeed(`[${index + 1}/${total}] ${fileName} 下载完成`);
      }
      stats.success++;
      return;
    } catch (error: any) {
      spinner.fail(`[${index + 1}/${total}] 下载失败 (${artist} - ${title}): ${error.message}`);
      if (attempt < maxRetries) {
        spinner.text = `[${index + 1}/${total}] 重试 ${attempt}/${maxRetries}...`;
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
      } else {
        spinner.fail(`[${index + 1}/${total}] 达到最大重试次数，放弃下载`);
        stats.failed++;
        return;
      }
    }
  }
}

// 下载歌单
async function downloadPlaylist(playlistUrl: string) {
  stats = { total: 0, success: 0, skipped: 0, failed: 0 };
  const token = await getAccessToken();
  if (!token) {
    log.error('无法获取 Spotify Token');
    return;
  }

  const playlistIdMatch = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
  const playlistId = playlistIdMatch ? playlistIdMatch[1] : playlistUrl;

  const { name: playlistName, tracks } = await getPlaylistTracks(playlistId, token);

  if (!tracks || tracks.length === 0) {
    log.error('无法获取歌单歌曲或歌单为空');
    return;
  }

  stats.total = tracks.length;
  const subDirName = sanitizePathName(playlistName || 'playlist');
  const targetDir = buildAbsolutePath(downloadDir, subDirName);
  await ensureDir(targetDir);
  log.info(`歌单名：${playlistName}，歌曲数：${tracks.length}，开始下载...`);

  progressBar = new ProgressBar('[:bar] :percent (:current/:total) :etas', {
    total: tracks.length,
    width: 40,
    complete: '█',
    incomplete: '░',
  });

  for (let i = 0; i < tracks.length; i++) {
    await downloadTrackToDir(tracks[i], i, tracks.length, targetDir);
    progressBar.tick();
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  progressBar.terminate();
  log.success(
    `歌单下载完成！总计 ${stats.total} 首，成功 ${stats.success}，跳过 ${stats.skipped}，失败 ${stats.failed}`
  );
}

// 下载专辑/EP
async function downloadAlbum(albumUrl: string) {
  stats = { total: 0, success: 0, skipped: 0, failed: 0 };
  const token = await getAccessToken();
  if (!token) {
    log.error('无法获取 Spotify Token');
    return;
  }

  const albumIdMatch = albumUrl.match(/album\/([a-zA-Z0-9]+)/);
  const albumId = albumIdMatch ? albumIdMatch[1] : albumUrl;

  const { name: albumName, tracks } = await getAlbumTracks(albumId, token);

  if (!tracks || tracks.length === 0) {
    log.error('无法获取专辑歌曲或专辑为空');
    return;
  }

  stats.total = tracks.length;
  const subDirName = sanitizePathName(albumName || 'album');
  const targetDir = buildAbsolutePath(downloadDir, subDirName);
  await ensureDir(targetDir);
  log.info(`专辑名：${albumName}，歌曲数：${tracks.length}，开始下载...`);

  progressBar = new ProgressBar('[:bar] :percent (:current/:total) :etas', {
    total: tracks.length,
    width: 40,
    complete: '█',
    incomplete: '░',
  });

  for (let i = 0; i < tracks.length; i++) {
    await downloadTrackToDir(tracks[i], i, tracks.length, targetDir);
    progressBar.tick();
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  progressBar.terminate();
  log.success(
    `专辑下载完成！总计 ${stats.total} 首，成功 ${stats.success}，跳过 ${stats.skipped}，失败 ${stats.failed}`
  );
}
// 处理中断
process.on('SIGINT', () => {
  if (progressBar) {
    progressBar.terminate();
  }
  console.log();
  log.warn('用户中断下载...');
  log.info(`下载统计：总计 ${stats.total} 首，成功 ${stats.success}，跳过 ${stats.skipped}，失败 ${stats.failed}`);
  process.exit(0);
});
// 定义命令：下载歌单
program
  .command('playlist <url>')
  .alias('p')
  .description('下载 Spotify 歌单')
  .option('-s, --scratch', '自动刮削并写入 ID3v2.4 元数据', false)
  .option('-o, --original', '去英文化：根据外部平台原始名称替换标签与文件名', false)
  .action(async (url: string, cmd: any) => {
    const scratch = Boolean(cmd.scratch);
    const original = Boolean(cmd.original);
    // 包装一层，将内部按目录下载时传递 scratch 标志
    async function downloadPlaylistWithScratch(u: string) {
      // 重用原实现，但在逐曲下载处传 scratch
      stats = { total: 0, success: 0, skipped: 0, failed: 0 };
      const token = await getAccessToken();
      if (!token) {
        log.error('无法获取 Spotify Token');
        return;
      }

      const playlistIdMatch = u.match(/playlist\/([a-zA-Z0-9]+)/);
      const playlistId = playlistIdMatch ? playlistIdMatch[1] : u;

      const { name: playlistName, tracks } = await getPlaylistTracks(playlistId, token);
      if (!tracks || tracks.length === 0) {
        log.error('无法获取歌单歌曲或歌单为空');
        return;
      }

      stats.total = tracks.length;
      const subDirName = sanitizePathName(playlistName || 'playlist');
      const targetDir = buildAbsolutePath(downloadDir, subDirName);
      await ensureDir(targetDir);
      log.info(`歌单名：${playlistName}，歌曲数：${tracks.length}，开始下载...`);

      progressBar = new ProgressBar('[:bar] :percent (:current/:total) :etas', {
        total: tracks.length,
        width: 40,
        complete: '█',
        incomplete: '░',
      });

      for (let i = 0; i < tracks.length; i++) {
        await downloadTrackToDir(tracks[i], i, tracks.length, targetDir, { scratch, original });
        progressBar.tick();
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }

      progressBar.terminate();
      log.success(`歌单下载完成！总计 ${stats.total} 首，成功 ${stats.success}，跳过 ${stats.skipped}，失败 ${stats.failed}`);
    }

    await downloadPlaylistWithScratch(url);
  });

// 定义命令：下载专辑/EP
program
  .command('album <url>')
  .alias('a')
  .description('下载 Spotify 专辑/EP')
  .option('-s, --scratch', '自动刮削并写入 ID3v2.4 元数据', false)
  .option('-o, --original', '去英文化：根据外部平台原始名称替换标签与文件名', false)
  .action(async (url: string, cmd: any) => {
    const scratch = Boolean(cmd.scratch);
    const original = Boolean(cmd.original);
    async function downloadAlbumWithScratch(u: string) {
      stats = { total: 0, success: 0, skipped: 0, failed: 0 };
      const token = await getAccessToken();
      if (!token) {
        log.error('无法获取 Spotify Token');
        return;
      }

      const albumIdMatch = u.match(/album\/([a-zA-Z0-9]+)/);
      const albumId = albumIdMatch ? albumIdMatch[1] : u;
      const { name: albumName, tracks } = await getAlbumTracks(albumId, token);
      if (!tracks || tracks.length === 0) {
        log.error('无法获取专辑歌曲或专辑为空');
        return;
      }
      stats.total = tracks.length;
      const subDirName = sanitizePathName(albumName || 'album');
      const targetDir = buildAbsolutePath(downloadDir, subDirName);
      await ensureDir(targetDir);
      log.info(`专辑名：${albumName}，歌曲数：${tracks.length}，开始下载...`);

      progressBar = new ProgressBar('[:bar] :percent (:current/:total) :etas', {
        total: tracks.length,
        width: 40,
        complete: '█',
        incomplete: '░',
      });

      for (let i = 0; i < tracks.length; i++) {
        await downloadTrackToDir(tracks[i], i, tracks.length, targetDir, { scratch, original });
        progressBar.tick();
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }

      progressBar.terminate();
      log.success(`专辑下载完成！总计 ${stats.total} 首，成功 ${stats.success}，跳过 ${stats.skipped}，失败 ${stats.failed}`);
    }

    await downloadAlbumWithScratch(url);
  });

// 定义命令：搜索并下载单曲
program
  .command('search <keywords...>')
  .alias('s')
  .description('搜索并下载单曲')
  .option('-s, --scratch', '自动刮削并写入 ID3v2.4 元数据', false)
  .option('-o, --original', '去英文化：根据外部平台原始名称替换标签与文件名', false)
  .action(async (keywords: string[], cmd: any) => {
    const query = keywords.join(' ');
    log.info(`搜索中: ${query}`);
    
    const token = await getAccessToken();
    if (!token) return;
    
    const results: SearchResult[] = await searchTracks(query, token);
    
    if (!results || results.length === 0) {
      log.error('未找到相关歌曲。请尝试其他关键词。');
      return;
    }
    
    let selectedTrackUrl: string | null = null;
    
    if (results.length === 1) {
      log.info(`找到唯一结果: ${results[0].artist} - ${results[0].title}`);
      selectedTrackUrl = results[0].trackUrl;
    } else {
      const choices = results.map((track, index) => ({
        name: `${index + 1}. ${track.artist} - ${track.title}`,
        value: track.trackUrl,
      }));
      
      try {
        const { chosenTrackUrl } = await inquirer.prompt([
        {
          type: 'list',
          name: 'chosenTrackUrl',
          message: '请选择要下载的歌曲:',
          choices: choices,
          pageSize: 10,
        }, ]);
        selectedTrackUrl = chosenTrackUrl;
      } catch {
        log.info('用户取消了选择。');
        return;
      }
    }
    
    if (!selectedTrackUrl) {
      log.error('未选择歌曲或选择失败。');
      return;
    }
    
    await downloadTrack(selectedTrackUrl, 0, 1, { scratch: Boolean(cmd.scratch), original: Boolean(cmd.original) });
  });

// 支持直接传 URL：自动识别歌单/专辑（支持 -s/--scratch）
const firstArg = process.argv[2];
const knownCommands = ['playlist', 'p', 'album', 'a', 'search', 's', '-h', '--help', '-V', '--version'];

if (firstArg && !knownCommands.includes(firstArg)) {
  const scratch = process.argv.includes('-s') || process.argv.includes('--scratch');
  if (/open\.spotify\.com\/(playlist)\//.test(firstArg) || /spotify:playlist:/.test(firstArg)) {
    // 直接调用封装的命令逻辑更稳妥，这里简单复用 downloadPlaylistWithScratch 的功能结构不易直接访问。
    // 为简化，退回到 program 的解析：
    program.parse(process.argv);
    process.exit(0);
  } else if (/open\.spotify\.com\/(album)\//.test(firstArg) || /spotify:album:/.test(firstArg)) {
    program.parse(process.argv);
    process.exit(0);
  } else {
    // 默认尝试按歌单处理（兼容旧行为）
    program.parse(process.argv);
    process.exit(0);
  }
} else {
  program.parse();
}