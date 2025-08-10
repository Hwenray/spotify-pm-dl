import { downloadAudioFromSearch } from './ytdlp.js';
import { searchKugouMusic, getKugouDownloadUrl, isKugouLoggedIn, checkKugouApiAvailable } from './kugou.js';

import chalk from 'chalk';
import axios from 'axios';
import fs from 'fs';

// 调试输出函数 - 需要从环境变量或其他方式获取调试状态
let debugMode = false;
export function setDebugMode(enabled: boolean) {
  debugMode = enabled;
}

function debugLog(message: string) {
  if (debugMode) {
    console.log(chalk.gray(`🔍 DEBUG: ${message}`));
  }
}

// 下载源枚举
export enum DownloadSource {
  YOUTUBE = 'youtube',
  KUGOU = 'kugou'
}

// 下载选项接口
export interface DownloadOptions {
  preferSource?: DownloadSource;
  enableKugou?: boolean;
  maxRetries?: number;
}

// 下载结果接口
export interface DownloadResult {
  success: boolean;
  source: DownloadSource;
  sourceName?: string;
  error?: string;
  kugouMetadata?: {
    title: string;
    artist: string;
    album: string;
  };
}

/**
 * 统一的音频下载管理器
 * 支持YouTube Music (yt-dlp) 和酷狗音乐双重下载源
 */
export class AudioDownloadManager {
  private kugouEnabled: boolean = false;
  private kugouApiAvailable: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    // 检查酷狗相关服务可用性
    this.kugouEnabled = await isKugouLoggedIn();
    this.kugouApiAvailable = await checkKugouApiAvailable();
  }

  /**
   * 设置是否启用酷狗音乐
   */
  public setKugouEnabled(enabled: boolean) {
    this.kugouEnabled = enabled;
  }

  /**
   * 检查酷狗音乐是否可用
   */
  public async isKugouAvailable(): Promise<boolean> {
    return this.kugouEnabled && this.kugouApiAvailable && await isKugouLoggedIn();
  }

  /**
   * 主要下载函数，支持多源下载和自动重试
   */
  public async downloadAudio(
    artist: string, 
    title: string, 
    outputPath: string, 
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const { preferSource = DownloadSource.YOUTUBE, enableKugou = this.kugouEnabled, maxRetries = 2 } = options;

    // 根据优先级确定下载顺序
    const sources = this.getDownloadOrder(preferSource, enableKugou);
    
    for (const source of sources) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // 只在调试模式下显示详细的重试信息
          if (debugMode) {
            debugLog(`尝试从${this.getSourceName(source)}下载: ${artist} - ${title} (尝试 ${attempt}/${maxRetries})`);
          }
          
          const result = await this.downloadFromSource(source, artist, title, outputPath);
          if (result.success) {
            // 简化成功信息，只显示最终结果
            return { ...result, sourceName: this.getSourceName(source) };
          }
        } catch (error: any) {
          if (debugMode) {
            debugLog(`${this.getSourceName(source)}下载失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);
          }
          
          // 只在最后一次重试失败时显示错误
          if (attempt === maxRetries && debugMode) {
            debugLog(`${this.getSourceName(source)}所有重试均失败`);
          }
        }
      }
    }

    return {
      success: false,
      source: preferSource,
      error: '所有下载源均失败'
    };
  }

  /**
   * 从指定源下载音频
   */
  private async downloadFromSource(
    source: DownloadSource, 
    artist: string, 
    title: string, 
    outputPath: string
  ): Promise<DownloadResult> {
    switch (source) {
      case DownloadSource.YOUTUBE:
        return await this.downloadFromYoutube(artist, title, outputPath);
      
      case DownloadSource.KUGOU:
        return await this.downloadFromKugou(artist, title, outputPath);
      
      default:
        throw new Error(`不支持的下载源: ${source}`);
    }
  }

  /**
   * 从YouTube Music下载
   */
  private async downloadFromYoutube(artist: string, title: string, outputPath: string): Promise<DownloadResult> {
    try {
      const query = `${artist} - ${title}`;
      await downloadAudioFromSearch(query, outputPath);
      return {
        success: true,
        source: DownloadSource.YOUTUBE
      };
    } catch (error: any) {
      return {
        success: false,
        source: DownloadSource.YOUTUBE,
        error: error.message
      };
    }
  }

  /**
   * 从酷狗音乐下载
   */
  private async downloadFromKugou(artist: string, title: string, outputPath: string): Promise<DownloadResult> {
    debugLog(`开始从酷狗音乐下载: ${artist} - ${title}`);
    
    if (!await this.isKugouAvailable()) {
      const errorMsg = '酷狗音乐不可用或未登录';
      debugLog(`酷狗下载失败: ${errorMsg}`);
      return {
        success: false,
        source: DownloadSource.KUGOU,
        error: errorMsg
      };
    }

    try {
      // 改进的搜索策略，优先精确匹配
      const searchQueries = [
        `${artist} ${title}`, // 艺术家 + 歌曲名 (最常见的格式)
        title, // 只搜索歌曲名
        `${title} ${artist}`, // 歌曲名 + 艺术家
        title.replace(/[!,\-\s()[\]]/g, ' ').trim(), // 去除特殊字符的歌曲名
        `${artist} ${title.replace(/[!,\-\s()[\]]/g, ' ').trim()}`, // 清理后的组合搜索
      ];

      let searchResults: any[] = [];
      let successQuery = '';
      
      for (const query of searchQueries) {
        debugLog(`尝试搜索关键词: "${query}"`);
        try {
          const results = await searchKugouMusic(query);
          if (results.length > 0) {
            debugLog(`查询 "${query}" 返回 ${results.length} 个结果`);
            
            // 改进的匹配算法 - 计算相似度分数
            const scoredResults = results.map((result: any) => {
              const songName = result.songName || result.SongName || '';
              const singerName = result.singerName || result.SingerName || '';
              
              let score = 0;
              
              // 歌曲名匹配检查 (权重更高)
              const titleLower = title.toLowerCase();
              const songLower = songName.toLowerCase();
              if (songLower.includes(titleLower) || titleLower.includes(songLower)) {
                score += 10;
              }
              // 完全匹配奖励更多分数
              if (songLower === titleLower) {
                score += 15;
              }
              
              // 艺术家匹配检查
              const artistLower = artist.toLowerCase();
              const singerLower = singerName.toLowerCase();
              if (singerLower.includes(artistLower) || artistLower.includes(singerLower)) {
                score += 8;
              }
              // 完全匹配奖励更多分数
              if (singerLower === artistLower) {
                score += 12;
              }
              
              // 关键词匹配度检查
              const queryWords = query.toLowerCase().split(/\s+/);
              const resultText = `${songName} ${singerName}`.toLowerCase();
              const matchedWords = queryWords.filter(word => 
                word.length > 1 && resultText.includes(word)
              ).length;
              score += matchedWords * 2;
              
              debugLog(`结果评分: ${singerName} - ${songName} = ${score}分`);
              
              return { ...result, matchScore: score };
            });
            
            // 按分数排序，选择最佳匹配
            scoredResults.sort((a, b) => b.matchScore - a.matchScore);
            
            // 只选择有一定匹配度的结果 (分数 >= 5)
            const relevantResults = scoredResults.filter(result => result.matchScore >= 5);
            
            if (relevantResults.length > 0) {
              searchResults = relevantResults.slice(0, 5); // 取前5个最佳匹配
              successQuery = query;
              debugLog(`找到 ${relevantResults.length} 个高质量匹配结果，使用查询: "${query}"`);
              break;
            } else if (results.length > 0 && searchResults.length === 0) {
              // 如果没有高分匹配但有结果，作为最后的备用选择
              searchResults = scoredResults.slice(0, 3);
              successQuery = query;
              debugLog(`未找到高分匹配，使用前3个结果作为备用，查询: "${query}"`);
            }
          }
        } catch (searchError: any) {
          debugLog(`搜索查询 "${query}" 失败: ${searchError.message}`);
          continue;
        }
      }
      
      if (searchResults.length === 0) {
        const errorMsg = '未找到匹配的歌曲';
        debugLog(`酷狗下载失败: ${errorMsg}`);
        return {
          success: false,
          source: DownloadSource.KUGOU,
          error: errorMsg
        };
      }

      debugLog(`最终使用搜索结果 (${searchResults.length}个):`);
      searchResults.forEach((result: any, index: number) => {
        debugLog(`  ${index + 1}. ${result.singerName || result.SingerName} - ${result.songName || result.SongName}`);
      });

      // 选择最匹配的结果（第一个）
      const bestMatch = searchResults[0];
      const hash = bestMatch.hash || bestMatch.Hash || bestMatch.FileHash;
      
      debugLog(`选择最佳匹配: ${bestMatch.songName || bestMatch.SongName} - ${bestMatch.singerName || bestMatch.SingerName} (hash: ${hash})`);
      
      // 提取酷狗元数据，无论下载是否成功都保存
      const kugouMetadata = {
        title: bestMatch.songName || bestMatch.SongName || title,
        artist: bestMatch.singerName || bestMatch.SingerName || artist,
        album: bestMatch.albumName || bestMatch.AlbumName || ''
      };
      
      const downloadUrl = await getKugouDownloadUrl(hash);
      debugLog(`获取下载链接: ${downloadUrl ? '成功' : '失败'}`);
      
      if (!downloadUrl) {
        const errorMsg = '歌曲需要付费或有版权限制，跳过酷狗下载';
        debugLog(`酷狗下载失败: ${errorMsg}，但保存元数据用于去英文化`);
        return {
          success: false,
          source: DownloadSource.KUGOU,
          error: errorMsg,
          kugouMetadata: kugouMetadata
        };
      }

      // 下载音频文件 - 如果主URL失败，尝试备用URL
      debugLog(`开始下载音频文件到: ${outputPath}`);
      
      let downloadSuccess = false;
      const urls = [downloadUrl]; // 主URL
      
      // 如果有备用URL，也加入尝试列表
      // 这里可以从API响应中获取备用URL，暂时先用主URL
      
      for (let i = 0; i < urls.length; i++) {
        try {
          debugLog(`尝试下载URL ${i + 1}/${urls.length}: ${urls[i].substring(0, 50)}...`);
          await this.downloadAudioFile(urls[i], outputPath, hash);
          downloadSuccess = true;
          debugLog(`酷狗下载成功，使用URL ${i + 1}`);
          break;
        } catch (error: any) {
          debugLog(`URL ${i + 1} 下载失败: ${error.message}`);
          if (i === urls.length - 1) {
            // 所有URL都失败了
            throw error;
          }
        }
      }
      
      if (!downloadSuccess) {
        throw new Error('所有下载URL都失败');
      }
      
      return {
        success: true,
        source: DownloadSource.KUGOU,
        kugouMetadata: kugouMetadata
      };
    } catch (error: any) {
      debugLog(`酷狗下载异常: ${error.message}`);
      return {
        success: false,
        source: DownloadSource.KUGOU,
        error: error.message
      };
    }
  }

  /**
   * 下载音频文件到指定路径
   */
  private async downloadAudioFile(url: string, outputPath: string, hash?: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        debugLog(`尝试下载: ${url}`);
        
        // 构建更完整的请求头
        const headers: any = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'identity', // 不要压缩，避免解码问题
          'Connection': 'keep-alive',
          'Referer': 'https://www.kugou.com/',
          'Origin': 'https://www.kugou.com',
          'Sec-Fetch-Dest': 'audio',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
        };

        // 如果有hash，添加到headers中
        if (hash) {
          headers['X-Hash'] = hash;
        }

        const response = await axios.get(url, {
          responseType: 'stream',
          timeout: 60000, // 增加超时时间
          headers,
          maxRedirects: 5, // 允许重定向
          validateStatus: function (status) {
            return status >= 200 && status < 400; // 允许3xx状态码
          }
        });

        debugLog(`下载响应状态: ${response.status}, Content-Type: ${response.headers['content-type']}`);

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        writer.on('finish', () => {
          debugLog(`文件写入完成: ${outputPath}`);
          resolve();
        });
        writer.on('error', (error) => {
          debugLog(`文件写入错误: ${error.message}`);
          reject(error);
        });
        response.data.on('error', (error: any) => {
          debugLog(`数据流错误: ${error.message}`);
          reject(error);
        });
      } catch (error: any) {
        debugLog(`下载请求失败: ${error.message}`);
        if (error.response) {
          debugLog(`响应状态: ${error.response.status}, 响应头: ${JSON.stringify(error.response.headers)}`);
          
          // 如果是403错误，尝试其他方法
          if (error.response.status === 403) {
            debugLog('遇到403错误，尝试使用备用下载方法...');
            try {
              await this.downloadAudioFileAlternative(url, outputPath);
              resolve();
              return;
            } catch (altError: any) {
              debugLog(`备用下载方法也失败: ${altError.message}`);
            }
          }
        }
        reject(new Error(`下载音频文件失败: ${error.message}`));
      }
    });
  }

  /**
   * 备用下载方法 - 使用更简单的请求
   */
  private async downloadAudioFileAlternative(url: string, outputPath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        debugLog('使用备用下载方法...');
        
        const response = await axios.get(url, {
          responseType: 'stream',
          timeout: 60000,
          headers: {
            'User-Agent': 'KuGou2012-9020-ExpandMusic',
          }
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
      } catch (error: any) {
        reject(new Error(`备用下载失败: ${error.message}`));
      }
    });
  }

  /**
   * 获取下载源的显示名称
   */
  private getSourceName(source: DownloadSource): string {
    switch (source) {
      case DownloadSource.YOUTUBE:
        return 'YouTube Music';
      case DownloadSource.KUGOU:
        return '酷狗音乐';
      default:
        return '未知源';
    }
  }

  /**
   * 根据偏好确定下载顺序
   */
  private getDownloadOrder(preferSource: DownloadSource, enableKugou: boolean): DownloadSource[] {
    const sources: DownloadSource[] = [];
    
    if (preferSource === DownloadSource.KUGOU && enableKugou) {
      sources.push(DownloadSource.KUGOU);
      sources.push(DownloadSource.YOUTUBE);
    } else if (preferSource === DownloadSource.YOUTUBE) {
      sources.push(DownloadSource.YOUTUBE);
      if (enableKugou) {
        sources.push(DownloadSource.KUGOU);
      }
    } else {
      // 默认顺序
      sources.push(DownloadSource.YOUTUBE);
      if (enableKugou) {
        sources.push(DownloadSource.KUGOU);
      }
    }
    
    return sources;
  }

  /**
   * 在酷狗音乐中搜索歌曲（用于去英文化等功能）
   */
  public async searchInKugou(artist: string, title: string): Promise<any[] | null> {
    if (!await this.isKugouAvailable()) {
      return null;
    }

    try {
      const query = `${artist} ${title}`;
      const results = await searchKugouMusic(query);
      return results.map(result => ({
        title: result.songName,
        artist: result.singerName,
        album: result.albumName,
        source: 'kugou'
      }));
    } catch (error: any) {
      console.log(chalk.yellow(`⚠ 酷狗搜索失败: ${error.message}`));
      return null;
    }
  }
}

// 导出单例实例
export const audioDownloadManager = new AudioDownloadManager();

// 导出兼容性函数
export async function downloadAudioFromSearchWithFallback(
  artist: string, 
  title: string, 
  outputPath: string, 
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const result = await audioDownloadManager.downloadAudio(artist, title, outputPath, options);
  
  if (!result.success) {
    throw new Error(result.error || '下载失败');
  }
  
  return result;
}