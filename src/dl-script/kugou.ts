import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import QRCode from 'qrcode-terminal';

// 调试模式
let debugMode = false;
export function setKugouDebugMode(enabled: boolean) {
  debugMode = enabled;
}

function debugLog(message: string) {
  if (debugMode) {
    console.log(chalk.gray(`🔍 KUGOU DEBUG: ${message}`));
  }
}

import { kugouApiManager } from './kugou-api-manager.js';

// 酷狗音乐API基础配置
const AUTH_FILE_PATH = path.resolve('kugou-auth.json');

// 获取API基础URL
function getKugouApiUrl(): string {
  return kugouApiManager.getApiUrl();
}

// 酷狗用户认证信息接口
interface KugouAuth {
  userId: string;
  token: string;
  cookies: string;
  loginTime: number;
  expiresIn: number;
}

// 酷狗搜索结果接口
interface KugouSearchResult {
  hash: string;
  songName: string;
  singerName: string;
  albumName: string;
  duration: number;
  fileSize: number;
}

// 酷狗音乐下载链接响应接口
interface KugouUrlResponse {
  status: number;
  url?: string;
  error?: string;
}

// 检查酷狗API服务是否可用
export async function checkKugouApiAvailable(): Promise<boolean> {
  try {
    // 首先检查API是否运行
    if (await kugouApiManager.isApiRunning()) {
      return true;
    }
    
    // 如果没有运行，尝试启动
    debugLog('酷狗API服务未运行，尝试启动...');
    return await kugouApiManager.startApi();
  } catch (error: any) {
    debugLog(`酷狗API服务检查失败: ${error.message}`);
    return false;
  }
}

// 保存认证信息到文件
async function saveAuth(auth: KugouAuth): Promise<void> {
  try {
    await fs.writeFile(AUTH_FILE_PATH, JSON.stringify(auth, null, 2), 'utf-8');
  } catch (error: any) {
    console.log(chalk.yellow(`⚠ 保存酷狗认证信息失败: ${error.message}`));
  }
}

// 从文件读取认证信息
async function loadAuth(): Promise<KugouAuth | null> {
  try {
    const data = await fs.readFile(AUTH_FILE_PATH, 'utf-8');
    const auth: KugouAuth = JSON.parse(data);
    
    // 检查是否已过期（有效期7天）
    const now = Date.now();
    if (now - auth.loginTime > (auth.expiresIn || 7 * 24 * 60 * 60 * 1000)) {
      console.log(chalk.yellow('⚠ 酷狗登录信息已过期，需要重新登录'));
      return null;
    }
    
    return auth;
  } catch {
    return null;
  }
}

// 用户登录酷狗音乐
export async function loginKugou(): Promise<boolean> {
  console.log(chalk.blue('🎵 开始酷狗音乐登录流程...'));
  
  // 检查API服务是否可用
  if (!(await checkKugouApiAvailable())) {
    console.log(chalk.red('❌ 酷狗音乐API服务不可用，请确保已启动酷狗API服务'));
    console.log(chalk.yellow('💡 提示: 请先按照文档启动酷狗API服务: npm run dev'));
    return false;
  }

  try {
    console.log(chalk.yellow('⚠ 注意：目前仅支持二维码登录方式'));
    
    const { confirmLogin } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmLogin',
      message: '是否使用二维码登录酷狗音乐？',
      default: true
    }]);

    if (!confirmLogin) {
      console.log(chalk.yellow('⚠ 用户取消登录'));
      return false;
    }

    const authResult = await loginWithQR();

    if (authResult) {
      const authData: KugouAuth = {
        userId: authResult.userId || '',
        token: authResult.token || '',
        cookies: authResult.cookies || '',
        loginTime: Date.now(),
        expiresIn: 7 * 24 * 60 * 60 * 1000 // 7天有效期
      };
      await saveAuth(authData);
      console.log(chalk.green('✅ 酷狗音乐登录成功！'));
      return true;
    }
  } catch (error: any) {
    console.log(chalk.red(`❌ 登录失败: ${error.message}`));
  }

  return false;
}


// 二维码登录
async function loginWithQR(): Promise<Partial<KugouAuth> | null> {
  try {
    // 获取二维码key
    const keyResponse = await axios.get(`${getKugouApiUrl()}/login/qr/key`);
    
    if (keyResponse.data.status !== 1) {
      throw new Error('获取二维码Key失败');
    }
    
    const key = keyResponse.data.data.qrcode;
    
    console.log(chalk.blue('📱 请使用酷狗音乐APP扫描二维码登录:'));
    console.log(''); // 空行
    
    // 生成二维码并在终端显示
    try {
      // 获取二维码创建接口来生成实际的二维码
      const qrCreateResponse = await axios.get(`${getKugouApiUrl()}/login/qr/create`, {
        params: { key, qrimg: true }
      });
      
      // 修正API响应结构判断 - 实际返回code而不是status
      if (qrCreateResponse.data.code === 200 && qrCreateResponse.data.data) {
        const qrData = qrCreateResponse.data.data;
        const base64Image = qrData.base64; // API返回的字段是base64而不是qrimg
        const qrUrl = qrData.url; // API返回的URL
        
        console.log(chalk.cyan('二维码Key: ') + key);
        console.log(chalk.cyan('二维码URL: ') + qrUrl);
        console.log(''); // 空行
        
        // 尝试多种二维码显示方式
        let qrDisplayed = false;
        
        // 首先尝试使用API返回的URL
        try {
          console.log(chalk.gray('使用API返回的URL显示二维码...'));
          QRCode.generate(qrUrl, { small: true });
          qrDisplayed = true;
        } catch (err) {
          console.log(chalk.yellow('⚠ 无法使用API URL显示二维码，尝试其他方案'));
        }
        
        // 如果API URL失败，尝试其他格式
        if (!qrDisplayed) {
          const fallbackUrls = [
            `https://login.kugou.com/qr?key=${key}`,
            `kugou://qr/login/${key}`,
            key
          ];
          
          for (const url of fallbackUrls) {
            try {
              console.log(chalk.gray(`尝试备用URL: ${url}`));
              QRCode.generate(url, { small: true });
              qrDisplayed = true;
              break;
            } catch (err) {
              continue;
            }
          }
        }
        
        // 如果还是无法显示，保存base64图片
        if (!qrDisplayed) {
          console.log(chalk.yellow('⚠ 无法在终端显示二维码，尝试保存为图片文件'));
          
          try {
            const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
            const qrImagePath = path.resolve('temp_qrcode.png');
            await fs.writeFile(qrImagePath, base64Data, 'base64');
            
            console.log(chalk.green(`✅ 二维码已保存为: ${qrImagePath}`));
            console.log(chalk.yellow('请使用图片查看器打开该文件，然后用酷狗音乐APP扫描'));
          } catch (saveError) {
            console.log(chalk.red('❌ 保存二维码图片失败'));
            console.log(chalk.cyan('请访问以下链接查看二维码:'));
            console.log(chalk.cyan(qrUrl));
          }
        }
        
        console.log(chalk.yellow('💡 提示：'));
        console.log(chalk.yellow('1. 打开酷狗音乐APP'));  
        console.log(chalk.yellow('2. 进入扫码页面'));
        console.log(chalk.yellow('3. 扫描上方二维码或访问: ') + chalk.cyan(qrUrl));
        console.log(chalk.yellow('4. 或者手动输入Key: ') + chalk.cyan(key));
        
      } else {
        throw new Error(`无法生成二维码，API返回: ${JSON.stringify(qrCreateResponse.data)}`);
      }
    } catch (error: any) {
      console.log(chalk.yellow('⚠ 无法生成二维码，使用备用方案'));
      console.log(chalk.cyan(`二维码Key: ${key}`));
      console.log(chalk.yellow('请打开酷狗音乐APP，进入扫码页面手动输入以上Key'));
      console.log(chalk.red(`错误详情: ${error.message}`));
    }
    
    console.log(''); // 空行
    console.log(chalk.yellow('📱 扫码完成后，请按回车键继续...'));
    
    // 等待用户确认扫码完成
    await inquirer.prompt([{
      type: 'input',
      name: 'continue',
      message: '扫码完成后按回车继续',
      default: ''
    }]);

    // 轮询检查登录状态
    return new Promise((resolve, reject) => {
      let checkCount = 0;
      const maxChecks = 90; // 最多检查90次 (3分钟)
      
      console.log(chalk.blue('🔄 正在检查登录状态...'));
      
      const checkInterval = setInterval(async () => {
        try {
          checkCount++;
          
          const checkResponse = await axios.get(`${getKugouApiUrl()}/login/qr/check`, {
            params: { key }
          });

          const status = checkResponse.data.status;
          const code = checkResponse.data.code;
          
          // 根据参考项目的状态码进行判断
          if (code === 2 || code === 801) {
            console.log(chalk.blue('👀 已扫码，等待确认...'));
          } else if (code === 4 || code === 803 || status === 1) {
            clearInterval(checkInterval);
            console.log(chalk.green('✅ 登录成功!'));
            
            // 根据响应获取登录信息
            const userData = checkResponse.data.data || checkResponse.data;
            resolve({
              userId: userData.userId || userData.user_id || '',
              token: userData.token || userData.access_token || '',
              cookies: userData.cookie || userData.cookies || ''
            });
          } else if (code === 0 || code === 805) {
            clearInterval(checkInterval);
            reject(new Error('二维码已过期，请重新获取'));
          } else if (checkCount >= maxChecks) {
            clearInterval(checkInterval);
            reject(new Error('登录超时，请重试'));
          }
          
          // 每5次检查显示一次等待消息，避免过多输出
          if (checkCount % 5 === 0) {
            console.log(chalk.gray(`⏳ 等待扫码确认... (${checkCount}/${maxChecks})`));
          }
          
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 2000); // 每2秒检查一次
    });
  } catch (error: any) {
    throw new Error(`二维码登录失败: ${error.message}`);
  }
}

// 退出登录
export async function logoutKugou(): Promise<boolean> {
  try {
    await fs.unlink(AUTH_FILE_PATH);
    console.log(chalk.green('✅ 已退出酷狗音乐登录'));
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(chalk.yellow('⚠ 未找到登录信息文件，可能已经未登录'));
      return true;
    }
    console.log(chalk.red(`❌ 退出登录失败: ${error.message}`));
    return false;
  }
}

// 检查是否已登录
export async function isKugouLoggedIn(): Promise<boolean> {
  const auth = await loadAuth();
  return auth !== null;
}

// 在酷狗音乐中搜索歌曲
export async function searchKugouMusic(keyword: string): Promise<KugouSearchResult[]> {
  debugLog(`开始搜索酷狗音乐: ${keyword}`);
  
  const auth = await loadAuth();
  if (!auth) {
    debugLog('搜索失败: 未登录酷狗音乐');
    throw new Error('未登录酷狗音乐，请先登录');
  }

  try {
    debugLog(`使用认证信息搜索，userId: ${auth.userId}`);
    
    // 尝试多种搜索API接口
    const searchEndpoints = [
      '/search',
      '/search/song',
      '/cloudsearch'
    ];
    
    let searchResponse = null;
    let usedEndpoint = '';
    
    for (const endpoint of searchEndpoints) {
      try {
        debugLog(`尝试搜索接口: ${endpoint}`);
        const response = await axios.get(`${getKugouApiUrl()}${endpoint}`, {
          params: {
            keywords: keyword, // 尝试 keywords 参数
            keyword,           // 保留 keyword 参数作为备用
            page: 1,
            pagesize: 20,      // 增加返回数量
            limit: 20          // 额外的限制参数
          },
          headers: {
            'Cookie': auth.cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 15000
        });
        
        debugLog(`${endpoint} 接口响应状态: ${response.status}, 数据: ${JSON.stringify(response.data).substring(0, 200)}...`);
        
        if (response.data && (response.data.status === 1 || response.data.code === 0 || response.data.data)) {
          searchResponse = response;
          usedEndpoint = endpoint;
          break;
        }
      } catch (endpointError: any) {
        debugLog(`接口 ${endpoint} 失败: ${endpointError.message}`);
        continue;
      }
    }
    
    if (!searchResponse) {
      throw new Error('所有搜索接口都无法访问');
    }
    
    debugLog(`成功使用接口: ${usedEndpoint}`);
    const responseData = searchResponse.data;
    
    // 解析不同格式的响应数据
    let songList: any[] = [];
    
    if (responseData.data && responseData.data.lists) {
      songList = responseData.data.lists;
    } else if (responseData.data && responseData.data.songs) {
      songList = responseData.data.songs;
    } else if (responseData.data && Array.isArray(responseData.data)) {
      songList = responseData.data;
    } else if (responseData.songs) {
      songList = responseData.songs;
    } else if (responseData.lists) {
      songList = responseData.lists;
    }
    
    if (!songList || songList.length === 0) {
      debugLog(`搜索无结果，完整响应: ${JSON.stringify(responseData)}`);
      throw new Error('搜索无结果');
    }

    const results = songList.map((item: any) => {
      // 支持多种字段格式
      const hash = item.FileHash || item.hash || item.Hash || '';
      const songName = item.FileName || item.SongName || item.songName || item.name || item.OriSongName || '未知歌曲';
      const singerName = item.SingerName || item.singerName || item.artist || item.artistName || '未知艺术家';
      const albumName = item.AlbumName || item.albumName || item.album || '';
      const duration = item.Duration || item.duration || 0;
      const fileSize = item.FileSize || item.fileSize || item.size || 0;
      
      debugLog(`解析歌曲: ${singerName} - ${songName} (hash: ${hash})`);
      
      return {
        hash,
        songName,
        singerName,
        albumName,
        duration,
        fileSize
      };
    }).filter(item => item.hash && item.songName !== '未知歌曲'); // 过滤掉无效结果
      
    debugLog(`搜索成功，返回 ${results.length} 个有效结果:`);
    results.forEach((result: KugouSearchResult, index: number) => {
      debugLog(`  ${index + 1}. ${result.singerName} - ${result.songName} (${result.hash})`);
    });
    
    if (results.length === 0) {
      throw new Error('未找到有效的搜索结果');
    }
    
    return results;
  } catch (error: any) {
    debugLog(`搜索异常: ${error.message}`);
    throw new Error(`酷狗搜索失败: ${error.message}`);
  }
}

// 获取酷狗音乐下载链接
export async function getKugouDownloadUrl(hash: string): Promise<string | null> {
  debugLog(`开始获取下载链接: ${hash}`);
  
  const auth = await loadAuth();
  if (!auth) {
    debugLog('获取下载链接失败: 未登录酷狗音乐');
    throw new Error('未登录酷狗音乐，请先登录');
  }

  try {
    debugLog(`尝试获取下载链接，使用hash: ${hash}`);
    
    const response = await axios.get(`${getKugouApiUrl()}/song/url`, {
      params: { hash },
      headers: {
        'Cookie': auth.cookies
      }
    });

    debugLog(`下载链接API响应状态: ${response.data.status}, 完整响应: ${JSON.stringify(response.data)}`);

    // 检查并处理不同格式的下载链接响应
    let downloadUrl = null;
    
    // 处理不同的状态码
    if (response.data.status === 2) {
      debugLog('歌曲需要付费或有版权限制，跳过');
      return null;
    } else if (response.data.status === 0) {
      debugLog('歌曲不存在或已下架，跳过');
      return null;
    } else if (response.data.status === 1) {
      // 尝试多种可能的URL字段
      if (response.data.url) {
        // 处理URL数组或字符串
        if (Array.isArray(response.data.url)) {
          downloadUrl = response.data.url[0]; // 取第一个URL
        } else {
          downloadUrl = typeof response.data.url === 'string' ? response.data.url : response.data.url.toString();
        }
      } else if (response.data.backupUrl && Array.isArray(response.data.backupUrl)) {
        downloadUrl = response.data.backupUrl[0]; // 尝试使用备用URL
      } else if (response.data.data && response.data.data.play_url) {
        downloadUrl = response.data.data.play_url;
      } else if (response.data.data && response.data.data.url) {
        downloadUrl = response.data.data.url;
      } else if (response.data.play_url) {
        downloadUrl = response.data.play_url;
      }
      
      if (downloadUrl) {
        debugLog(`成功获取下载链接: ${downloadUrl.substring(0, 50)}...`);
        return downloadUrl;
      }
    }
    
    debugLog('主接口未返回有效链接，尝试新版本接口...');
    // 尝试新版本接口
    const newResponse = await axios.get(`${getKugouApiUrl()}/song/url/new`, {
      params: { hash },
      headers: {
        'Cookie': auth.cookies
      }
    });

    debugLog(`新接口响应状态: ${newResponse.data.status}, 完整响应: ${JSON.stringify(newResponse.data)}`);

    // 处理新接口的不同状态码
    if (newResponse.data.status === 2) {
      debugLog('新接口：歌曲需要付费或有版权限制，跳过');
      return null;
    } else if (newResponse.data.status === 0) {
      debugLog('新接口：歌曲不存在或已下架，跳过');
      return null;
    } else if (newResponse.data.status === 1) {
      // 同样处理新接口的多种URL格式
      if (newResponse.data.url) {
        // 处理URL数组或字符串
        if (Array.isArray(newResponse.data.url)) {
          downloadUrl = newResponse.data.url[0]; // 取第一个URL
        } else {
          downloadUrl = typeof newResponse.data.url === 'string' ? newResponse.data.url : newResponse.data.url.toString();
        }
      } else if (newResponse.data.backupUrl && Array.isArray(newResponse.data.backupUrl)) {
        downloadUrl = newResponse.data.backupUrl[0]; // 尝试使用备用URL
      } else if (newResponse.data.data && newResponse.data.data.play_url) {
        downloadUrl = newResponse.data.data.play_url;
      } else if (newResponse.data.data && newResponse.data.data.url) {
        downloadUrl = newResponse.data.data.url;
      } else if (newResponse.data.play_url) {
        downloadUrl = newResponse.data.play_url;
      }
      
      if (downloadUrl) {
        debugLog(`新接口成功获取下载链接: ${downloadUrl.substring(0, 50)}...`);
        return downloadUrl;
      }
    }

    debugLog('所有接口都未能获取到下载链接');
    return null;
  } catch (error: any) {
    debugLog(`获取下载链接异常: ${error.message}`);
    throw new Error(`获取酷狗下载链接失败: ${error.message}`);
  }
}

// 提示用户是否启用酷狗下载
export async function promptKugouEnable(forceMode = false): Promise<boolean> {
  const isLoggedIn = await isKugouLoggedIn();
  
  if (isLoggedIn) {
    if (forceMode) {
      console.log(chalk.green('✅ 酷狗音乐已登录'));
      
      // 已登录时提供管理选项
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: '选择操作:',
        choices: [
          { name: '使用当前登录状态', value: 'use' },
          { name: '重新登录', value: 'relogin' },
          { name: '退出登录', value: 'logout' }
        ]
      }]);

      switch (action) {
        case 'use':
          return true;
        case 'relogin':
          console.log(chalk.blue('🔄 准备重新登录酷狗音乐...'));
          await logoutKugou();
          return await loginKugou();
        case 'logout':
          await logoutKugou();
          console.log(chalk.yellow('⚠ 已退出酷狗登录，将仅使用YouTube Music下载'));
          return false;
        default:
          return true;
      }
    } else {
      return true; // 已登录，默认启用
    }
  }

  const message = forceMode 
    ? '使用 -k/--kugou 参数需要登录酷狗账号，是否现在登录？'
    : '是否启用酷狗音乐作为备用下载源？（需要登录酷狗账号）';

  const { enableKugou } = await inquirer.prompt([{
    type: 'confirm',
    name: 'enableKugou',
    message,
    default: forceMode // 强制模式下默认为true
  }]);

  if (enableKugou) {
    return await loginKugou();
  }

  if (forceMode) {
    console.log(chalk.yellow('⚠ 未登录酷狗音乐，将仅使用YouTube Music下载'));
  }

  return false;
}