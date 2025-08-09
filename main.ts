#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
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

// 简化的日志输出函数
const log = {
  info: (msg: string) => console.log(chalk.blueBright(`ℹ ${msg}`)),
  success: (msg: string) => console.log(chalk.green(`✅ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`⚠ ${msg}`)),
  error: (msg: string) => console.log(chalk.red(`❌ ${msg}`)),
};

// 处理去英文化逻辑
async function processOriginalMetadata(full: any, options: { original?: boolean }, index: number, total: number): Promise<any> {
  if (!options?.original) return full;
  
  const proposal = await proposeOriginalMetadata(full);
  if (proposal) {
    const oldArtist = full.artist;
    const oldTitle = full.title;
    const newTitle = proposal.title || full.title;
    const newArtist = proposal.artist || full.artist;
    const newAlbum = proposal.album || full.album;
    const newAlbumArtists = proposal.albumArtist || full.albumArtists;
    const changedDisplay = newArtist !== oldArtist || newTitle !== oldTitle;

    const updatedFull = {
      ...full,
      title: newTitle,
      artist: newArtist,
      album: newAlbum,
      albumArtists: newAlbumArtists,
    };

    if (changedDisplay) {
      const oldDisplay = `${oldArtist} - ${oldTitle}`;
      const newDisplay = `${newArtist} - ${newTitle}`;
      const message = `去英文化：${oldDisplay} -> ${newDisplay}`;
      log.info(`[${index + 1}/${total}] ${message}`);
    }
    return updatedFull;
  } else {
    const message = `未找到原始名称，保留 Spotify 名称`;
    log.warn(`[${index + 1}/${total}] ${message}`);
    return full;
  }
}

// 处理元数据刮削逻辑
async function processScratchMetadata(trackUrl: string, token: string, filePath: string, options: { scratch?: boolean; original?: boolean }, index: number, total: number) {
  if (!options?.scratch) return;
  
  try {
    let full = await getTrackFullInfo(trackUrl, token);
    if (!full) throw new Error('获取完整元数据失败');
    
    const updatedFull = await processOriginalMetadata(full, options, index, total);
    
    const cover = selectAlbumImageUrl(updatedFull.images, 300) || undefined;
    const tempOut = filePath + '.tmp.mp3';
    const trackStr = updatedFull.totalTracks && updatedFull.trackNumber ? `${updatedFull.trackNumber}/${updatedFull.totalTracks}` : updatedFull.trackNumber?.toString();
    const discStr = updatedFull.discNumber ? `${updatedFull.discNumber}` : undefined;

    await writeId3v24Utf8Tags(filePath, tempOut, {
      title: updatedFull.title,
      artist: updatedFull.artist,
      album: updatedFull.album,
      albumArtist: updatedFull.albumArtists,
      date: updatedFull.releaseDate,
      track: trackStr,
      disc: discStr,
    }, cover);
    
    await fs.rename(tempOut, filePath);
    const message = `已写入元数据: ${updatedFull.artist} - ${updatedFull.title}.mp3`;
    log.success(`[${index + 1}/${total}] ${message}`);
    
    return updatedFull;
  } catch (e: any) {
    const message = `元数据写入失败，已跳过：${e.message}`;
    log.error(`[${index + 1}/${total}] ${message}`);
  }
}

// 统一的下载单曲函数
async function downloadTrack(
  trackUrl: string,
  index: number,
  total: number,
  targetDir?: string,
  options?: { scratch?: boolean; original?: boolean }
) {
  const downloadPath = targetDir || downloadDir;
  let artist = '未知艺术家';
  let title = '未知标题';

  // 确保下载目录存在
  try {
    if (targetDir) {
      await ensureDir(targetDir);
    } else {
      await fs.mkdir(downloadDir, { recursive: true });
    }
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
      let filePath = buildAbsolutePath(downloadPath, fileName);

      // 检查文件是否已存在
      const fileExists = targetDir 
        ? await fs.access(filePath).then(() => true).catch(() => false)
        : (await checkFileExists(artist, title)).exists;
      
      if (fileExists) {
        log.warn(`[${index + 1}/${total}] ${fileName} 已存在，跳过`);
        stats.skipped++;
        return;
      }

      log.info(`[${index + 1}/${total}] 使用 yt-dlp 下载: ${fileName}`);
      await downloadAudioFromSearch(`${artist} - ${title}`, filePath);

      // 处理元数据刮削
      const processedMeta = await processScratchMetadata(trackUrl, token, filePath, options || {}, index, total);
      
      // 如果进行了去英文化处理，需要更新文件路径
      if (processedMeta && options?.original) {
        const newFileName = `${processedMeta.artist} - ${processedMeta.title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
        const newPath = buildAbsolutePath(downloadPath, newFileName);
        if (newPath !== filePath) {
          try { 
            await fs.rename(filePath, newPath); 
            filePath = newPath; 
          } catch {}
        }
      }

      if (!options?.scratch) {
        log.success(`[${index + 1}/${total}] ${fileName} 下载完成`);
      }
      
      stats.success++;
      return;
    } catch (error: any) {
      log.error(`[${index + 1}/${total}] 下载失败 (${artist} - ${title}): ${error.message}`);
      
      if (attempt < maxRetries) {
        log.info(`[${index + 1}/${total}] 重试 ${attempt}/${maxRetries}...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
      } else {
        log.error(`[${index + 1}/${total}] 达到最大重试次数，放弃下载`);
        stats.failed++;
        return;
      }
    }
  }
}

// 通用下载函数（支持歌单/专辑）
async function downloadCollection(type: 'playlist' | 'album', url: string, options?: { scratch?: boolean; original?: boolean }) {
  stats = { total: 0, success: 0, skipped: 0, failed: 0 };
  const token = await getAccessToken();
  if (!token) {
    log.error('无法获取 Spotify Token');
    return;
  }

  const idMatch = url.match(new RegExp(`${type}\/([a-zA-Z0-9]+)`));
  const id = idMatch ? idMatch[1] : url;

  const getData = type === 'playlist' ? getPlaylistTracks : getAlbumTracks;
  const { name, tracks } = await getData(id, token);

  if (!tracks || tracks.length === 0) {
    log.error(`无法获取${type === 'playlist' ? '歌单' : '专辑'}歌曲或${type === 'playlist' ? '歌单' : '专辑'}为空`);
    return;
  }

  stats.total = tracks.length;
  const subDirName = sanitizePathName(name || type);
  const targetDir = buildAbsolutePath(downloadDir, subDirName);
  await ensureDir(targetDir);
  
  const typeName = type === 'playlist' ? '歌单' : '专辑';
  log.info(`${typeName}名：${name}，歌曲数：${tracks.length}，开始下载...`);

  for (let i = 0; i < tracks.length; i++) {
    await downloadTrack(tracks[i], i, tracks.length, targetDir, options);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  log.success(
    `${typeName}下载完成！总计 ${stats.total} 首，成功 ${stats.success}，跳过 ${stats.skipped}，失败 ${stats.failed}`
  );
  
  // 确保程序正常结束
  process.exit(0);
}
// 处理中断
process.on('SIGINT', () => {
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
    await downloadCollection('playlist', url, { 
      scratch: Boolean(cmd.scratch), 
      original: Boolean(cmd.original) 
    });
  });

// 定义命令：下载专辑/EP
program
  .command('album <url>')
  .alias('a')
  .description('下载 Spotify 专辑/EP')
  .option('-s, --scratch', '自动刮削并写入 ID3v2.4 元数据', false)
  .option('-o, --original', '去英文化：根据外部平台原始名称替换标签与文件名', false)
  .action(async (url: string, cmd: any) => {
    await downloadCollection('album', url, { 
      scratch: Boolean(cmd.scratch), 
      original: Boolean(cmd.original) 
    });
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
    
    await downloadTrack(selectedTrackUrl, 0, 1, undefined, { scratch: Boolean(cmd.scratch), original: Boolean(cmd.original) });
    
    // 确保程序正常结束
    process.exit(0);
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