#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import ProgressBar from 'progress';
import { getAccessToken, getPlaylistTracks, searchTracks, SearchResult } from './spotify.js';
import { fetchDownloadLink } from './dl.js';
import { addToAria2 } from './aria2.js';
import { config } from './config.js';
import { checkFileExists } from './utils.js';

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


// 下载单首歌曲
async function downloadTrack(trackUrl: string, index: number, total: number) {
  const spinner = ora({
    text: `[${index + 1}/${total}] 获取下载链接: ${trackUrl}`,
    color: 'blue',
  }).start();
  
  let artist = '未知艺术家';
  let title = '未知标题';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await fetchDownloadLink(trackUrl);
      
      if (!data || !data.success || !data.data?.downloadLink) {
        throw new Error('API 返回异常或下载链接无效');
      }
      
      const { downloadLink, artist: fetchedArtist, title: fetchedTitle } = data.data;
      artist = fetchedArtist;
      title = fetchedTitle;
      const fileName = `${artist} - ${title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
      
      const { exists } = await checkFileExists(artist, title);
      if (exists) {
        spinner.warn(`[${index + 1}/${total}] ${fileName} 已存在，跳过`);
        stats.skipped++;
        return;
      }
      
      spinner.text = `[${index + 1}/${total}] 添加到下载队列: ${fileName}`;
      await addToAria2(downloadLink, fileName);
      spinner.succeed(`[${index + 1}/${total}] ${fileName} 下载任务添加成功`);
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

// ... 其他导入保持不变

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
  log.info(`歌单名：${playlistName}，歌曲数：${tracks.length}，开始下载...`);

  progressBar = new ProgressBar('[:bar] :percent (:current/:total) :etas', {
    total: tracks.length,
    width: 40,
    complete: '█',
    incomplete: '░',
  });

  for (let i = 0; i < tracks.length; i++) {
    await downloadTrack(tracks[i], i, tracks.length);
    progressBar.tick();
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  progressBar.terminate();
  log.success(
    `歌单下载完成！总计 ${stats.total} 首，成功 ${stats.success}，跳过 ${stats.skipped}，失败 ${stats.failed}`
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
  .action(downloadPlaylist);

// 定义命令：搜索并下载单曲
program
  .command('search <keywords...>')
  .alias('s')
  .description('搜索并下载单曲')
  .action(async (keywords: string[]) => {
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
    
    await downloadTrack(selectedTrackUrl, 0, 1);
  });

// 支持直接传歌单 URL
const firstArg = process.argv[2];
const knownCommands = ['playlist', 'p', 'search', 's', '-h', '--help', '-V', '--version'];

if (firstArg && !knownCommands.includes(firstArg)) {
  downloadPlaylist(firstArg).catch((e) => {
    log.error(`脚本运行失败：${e.message}`);
  });
} else {
  program.parse();
}