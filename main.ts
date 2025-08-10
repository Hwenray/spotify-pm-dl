#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getAccessToken, getPlaylistTracks, searchTracks, SearchResult, getTrackInfoFromUrl, getAlbumTracks, getTrackFullInfo, selectAlbumImageUrl } from './src/sp-script/spotify.js';
import { buildAbsolutePath, writeId3v24Utf8Tags } from './src/dl-script/ytdlp.js';
import { audioDownloadManager, DownloadSource, setDebugMode } from './src/dl-script/download-manager.js';
import { promptKugouEnable, isKugouLoggedIn, loginKugou, logoutKugou, setKugouDebugMode } from './src/dl-script/kugou.js';
import { config } from './src/config.js';
import { checkFileExists, sanitizePathName, ensureDir } from './src/utils.js';
import fs from 'fs/promises';
import { proposeOriginalMetadata } from './src/metadata/original.js';

dotenv.config();

// 全局配置变量
let globalKugouEnabled = false;
let globalPreferKugou = false;
let globalDebugMode = false;
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

// 初始化酷狗功能
async function initializeKugou(): Promise<void> {
  try {
    // 检查是否已登录
    const isLoggedIn = await isKugouLoggedIn();
    if (isLoggedIn) {
      globalKugouEnabled = true;
      audioDownloadManager.setKugouEnabled(true);
      console.log(chalk.green('✅ 酷狗音乐已启用（已登录）'));
    } else {
      // 如果优先使用酷狗但未登录，强制提示登录
      if (globalPreferKugou) {
        console.log(chalk.blue('🎵 检测到 -k/--kugou 参数，需要先登录酷狗音乐'));
        globalKugouEnabled = await promptKugouEnable(true);
      } else {
        // 普通模式下询问是否启用酷狗
        globalKugouEnabled = await promptKugouEnable();
      }

      audioDownloadManager.setKugouEnabled(globalKugouEnabled);
      if (globalKugouEnabled) {
        console.log(chalk.green('✅ 酷狗音乐已启用'));
      }
    }
  } catch (error: any) {
    console.log(chalk.yellow(`⚠ 酷狗音乐初始化失败: ${error.message}`));
    globalKugouEnabled = false;
  }
}

// 简化的日志输出函数
const log = {
  info: (msg: string) => console.log(chalk.blueBright(`ℹ ${msg}`)),
  success: (msg: string) => console.log(chalk.green(`✅ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`⚠ ${msg}`)),
  error: (msg: string) => console.log(chalk.red(`❌ ${msg}`)),
  debug: (msg: string) => {
    if (globalDebugMode) {
      console.log(chalk.gray(`🔍 DEBUG: ${msg}`));
    }
  }
};

// 处理去英文化逻辑
async function processOriginalMetadata(full: any, options: { original?: boolean }, index: number, total: number, kugouMetadata?: { title: string; artist: string; album: string }): Promise<any> {
  if (!options?.original) return full;

  const proposal = await proposeOriginalMetadata(full, kugouMetadata);
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

    // 只在调试模式下显示详细的去英文化信息
    if (changedDisplay && globalDebugMode) {
      const oldDisplay = `${oldArtist} - ${oldTitle}`;
      const newDisplay = `${newArtist} - ${newTitle}`;
      log.debug(`去英文化：${oldDisplay} -> ${newDisplay}`);
    }
    return updatedFull;
  } else {
    if (globalDebugMode) {
      log.debug(`[${index + 1}/${total}] 未找到原始名称，保留 Spotify 名称`);
    }
    return full;
  }
}

// 处理元数据刮削逻辑
async function processScratchMetadata(trackUrl: string, token: string, filePath: string, options: { scratch?: boolean; original?: boolean }, index: number, total: number, sourceName?: string, kugouMetadata?: { title: string; artist: string; album: string }) {
  if (!options?.scratch) return;

  try {
    let full = await getTrackFullInfo(trackUrl, token);
    if (!full) throw new Error('获取完整元数据失败');

    const updatedFull = await processOriginalMetadata(full, options, index, total, kugouMetadata);

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

    // 合并显示完成信息，包含艺术家、专辑、去英文化、元数据和下载源信息
    const hasOriginalChange = options?.original && (updatedFull.title !== full.title || updatedFull.artist !== full.artist);
    const sourceInfo = sourceName ? ` [${sourceName}]` : '';
    const albumInfo = updatedFull.album ? ` (专辑: ${updatedFull.album})` : '';

    if (hasOriginalChange) {
      log.success(`[${index + 1}/${total}] 完成: ${updatedFull.artist} - ${updatedFull.title}${albumInfo} (已去英文化 + 元数据)${sourceInfo}`);
    } else {
      log.success(`[${index + 1}/${total}] 完成: ${updatedFull.artist} - ${updatedFull.title}${albumInfo} (已写入元数据)${sourceInfo}`);
    }

    return updatedFull;
  } catch (e: any) {
    log.error(`[${index + 1}/${total}] 元数据处理失败：${e.message}`);
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
  } catch { }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('无法获取 Spotify Token');

      // 获取完整的曲目信息，包括专辑名
      const fullMeta = await getTrackFullInfo(trackUrl, token);
      if (!fullMeta) throw new Error('无法获取单曲元数据');

      artist = fullMeta.artist;
      title = fullMeta.title;
      const album = fullMeta.album || '未知专辑';

      const fileName = `${artist} - ${title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
      let filePath = buildAbsolutePath(downloadPath, fileName);

      // 检查文件是否已存在
      const fileExists = targetDir
        ? await fs.access(filePath).then(() => true).catch(() => false)
        : (await checkFileExists(artist, title)).exists;

      if (fileExists) {
        log.warn(`[${index + 1}/${total}] 已存在，跳过: ${artist} - ${title}`);
        stats.skipped++;
        return;
      }

      // 显示详细的下载开始信息，包含艺术家和专辑
      log.info(`[${index + 1}/${total}] 下载中: ${artist} - ${title} (专辑: ${album})`);

      // 使用统一的下载管理器
      const downloadOptions = {
        preferSource: globalPreferKugou ? DownloadSource.KUGOU : DownloadSource.YOUTUBE,
        enableKugou: globalKugouEnabled,
        maxRetries: 2
      };

      const result = await audioDownloadManager.downloadAudio(artist, title, filePath, downloadOptions);
      if (!result.success) {
        throw new Error(result.error || '下载失败');
      }

      // 处理元数据刮削和去英文化
      let finalTitle = title;
      let finalArtist = artist;

      if (options?.scratch || options?.original) {
        const processedMeta = await processScratchMetadata(trackUrl, token, filePath, options || {}, index, total, result.sourceName, result.kugouMetadata);

        // 如果进行了去英文化处理，需要更新文件路径和显示信息
        if (processedMeta && options?.original) {
          finalTitle = processedMeta.title;
          finalArtist = processedMeta.artist;
          const newFileName = `${processedMeta.artist} - ${processedMeta.title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
          const newPath = buildAbsolutePath(downloadPath, newFileName);
          if (newPath !== filePath) {
            try {
              await fs.rename(filePath, newPath);
              filePath = newPath;
            } catch { }
          }
        }
      } else {
        // 如果没有元数据处理，显示完成信息，包含艺术家、专辑和下载源
        log.success(`[${index + 1}/${total}] 完成: ${finalArtist} - ${finalTitle} (专辑: ${album}) [${result.sourceName || ''}]`);
      }

      stats.success++;
      return;
    } catch (error: any) {
      log.error(`[${index + 1}/${total}] 失败: ${artist} - ${title} - ${error.message}`);

      if (attempt < maxRetries) {
        log.debug(`重试 ${attempt}/${maxRetries}...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
      } else {
        log.error(`[${index + 1}/${total}] 达到最大重试次数，放弃下载: ${artist} - ${title}`);
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

  // 智能URL解析 - 自动检测实际的URL类型
  let actualType = type;
  let id = '';

  // 首先尝试按指定类型解析
  let idMatch = url.match(new RegExp(`${type}\/([a-zA-Z0-9]+)`));

  if (!idMatch) {
    // 如果指定类型解析失败，尝试自动检测
    const playlistMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
    const albumMatch = url.match(/album\/([a-zA-Z0-9]+)/);

    if (playlistMatch && type === 'album') {
      log.warn('检测到歌单URL但使用了专辑命令，自动切换为歌单处理');
      actualType = 'playlist';
      id = playlistMatch[1];
    } else if (albumMatch && type === 'playlist') {
      log.warn('检测到专辑URL但使用了歌单命令，自动切换为专辑处理');
      actualType = 'album';
      id = albumMatch[1];
    } else {
      // 如果都不匹配，直接使用URL作为ID（可能是纯ID）
      id = url;
    }
  } else {
    id = idMatch[1];
  }

  const getData = actualType === 'playlist' ? getPlaylistTracks : getAlbumTracks;
  const { name, tracks } = await getData(id, token);

  if (!tracks || tracks.length === 0) {
    log.error(`无法获取${actualType === 'playlist' ? '歌单' : '专辑'}歌曲或${actualType === 'playlist' ? '歌单' : '专辑'}为空`);
    return;
  }

  stats.total = tracks.length;
  const subDirName = sanitizePathName(name || actualType);
  const targetDir = buildAbsolutePath(downloadDir, subDirName);
  await ensureDir(targetDir);

  const typeName = actualType === 'playlist' ? '歌单' : '专辑';
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

const program = new Command();

// 定义命令：下载歌单
program
  .command('playlist <url>')
  .alias('p')
  .description('下载 Spotify 歌单')
  .option('-s, --scratch', '自动刮削并写入 ID3v2.4 元数据', false)
  .option('-o, --original', '去英文化：根据外部平台原始名称替换标签与文件名', false)
  .option('-k, --kugou', '优先使用酷狗音乐作为下载源', false)
  .option('--debug', '输出详细调试信息', false)
  .action(async (url: string, cmd: any) => {
    if (cmd.debug) {
      globalDebugMode = true;
      setDebugMode(true);
      setKugouDebugMode(true);
      log.debug('已启用调试模式');
    }
    if (cmd.kugou) {
      globalPreferKugou = true;
      globalKugouEnabled = true;
    }
    await initializeKugou();

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
  .option('-k, --kugou', '优先使用酷狗音乐作为下载源', false)
  .option('--debug', '输出详细调试信息', false)
  .action(async (url: string, cmd: any) => {
    if (cmd.debug) {
      globalDebugMode = true;
      setDebugMode(true);
      setKugouDebugMode(true);
      log.debug('已启用调试模式');
    }
    if (cmd.kugou) {
      globalPreferKugou = true;
      globalKugouEnabled = true;
    }
    await initializeKugou();

    await downloadCollection('album', url, {
      scratch: Boolean(cmd.scratch),
      original: Boolean(cmd.original)
    });
  });

// 定义命令：搜索并下载单曲
program
  .command('search <query> [moreWords...]')
  .alias('s')
  .description('搜索并下载单曲')
  .option('-s, --scratch', '自动刮削并写入 ID3v2.4 元数据', false)
  .option('-o, --original', '去英文化：根据外部平台原始名称替换标签与文件名', false)
  .option('-k, --kugou', '优先使用酷狗音乐作为下载源', false)
  .option('--debug', '输出详细调试信息', false)
  .action(async (query: string, moreWords: string[], cmd: any) => {
    if (cmd.debug) {
      globalDebugMode = true;
      setDebugMode(true);
      setKugouDebugMode(true);
      log.debug('已启用调试模式');
    }
    if (cmd.kugou) {
      globalPreferKugou = true;
      globalKugouEnabled = true;
    }
    await initializeKugou();

    // 合并所有搜索词
    const fullQuery = moreWords.length > 0 ? `${query} ${moreWords.join(' ')}` : query;
    log.info(`搜索中: ${fullQuery}`);

    const token = await getAccessToken();
    if (!token) return;

    const results: SearchResult[] = await searchTracks(fullQuery, token);

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
          },]);
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

// 定义命令：酷狗音乐登录管理
program
  .command('kugou')
  .alias('kg')
  .description('酷狗音乐登录状态管理')
  .option('-l, --login', '登录酷狗音乐')
  .option('-o, --logout', '退出酷狗音乐登录')
  .option('-s, --status', '查看登录状态')
  .action(async (cmd: any) => {
    if (cmd.logout) {
      // 退出登录
      const success = await logoutKugou();
      process.exit(success ? 0 : 1);
    } else if (cmd.login) {
      // 强制重新登录
      console.log(chalk.blue('🔄 开始酷狗音乐登录...'));
      const success = await loginKugou();
      if (success) {
        console.log(chalk.green('✅ 酷狗音乐登录成功！'));
      } else {
        console.log(chalk.red('❌ 酷狗音乐登录失败'));
      }
      process.exit(success ? 0 : 1);
    } else if (cmd.status) {
      // 查看登录状态
      const isLoggedIn = await isKugouLoggedIn();
      if (isLoggedIn) {
        console.log(chalk.green('✅ 酷狗音乐已登录'));
      } else {
        console.log(chalk.yellow('⚠ 酷狗音乐未登录'));
      }
      process.exit(0);
    } else {
      // 默认显示登录管理菜单
      console.log(chalk.blue('🎵 酷狗音乐登录管理'));
      const isLoggedIn = await isKugouLoggedIn();

      if (isLoggedIn) {
        console.log(chalk.green('✅ 当前状态：已登录'));

        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: '选择操作:',
          choices: [
            { name: '重新登录', value: 'relogin' },
            { name: '退出登录', value: 'logout' },
            { name: '取消', value: 'cancel' }
          ]
        }]);

        switch (action) {
          case 'relogin':
            console.log(chalk.blue('🔄 准备重新登录酷狗音乐...'));
            await logoutKugou();
            const reloginSuccess = await loginKugou();
            process.exit(reloginSuccess ? 0 : 1);
            break;
          case 'logout':
            const logoutSuccess = await logoutKugou();
            process.exit(logoutSuccess ? 0 : 1);
            break;
          case 'cancel':
            console.log(chalk.gray('已取消'));
            process.exit(0);
            break;
        }
      } else {
        console.log(chalk.yellow('⚠ 当前状态：未登录'));

        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: '选择操作:',
          choices: [
            { name: '立即登录', value: 'login' },
            { name: '取消', value: 'cancel' }
          ]
        }]);

        if (action === 'login') {
          const loginSuccess = await loginKugou();
          process.exit(loginSuccess ? 0 : 1);
        } else {
          console.log(chalk.gray('已取消'));
          process.exit(0);
        }
      }
    }
  });

// 支持直接传 URL：自动识别歌单/专辑
const firstArg = process.argv[2];
const knownCommands = ['playlist', 'p', 'album', 'a', 'search', 's', 'kugou', 'kg', '-h', '--help', '-V', '--version'];

if (firstArg && !knownCommands.includes(firstArg)) {
  if (/open\.spotify\.com\/(playlist)\//.test(firstArg) || /spotify:playlist:/.test(firstArg)) {
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