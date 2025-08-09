import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';

const downloadDir = config.downloadDir;

export async function checkFileExists(artist: string, title: string): Promise<{ exists: boolean; fileName: string }> {
  const fileName = `${artist} - ${title}.mp3`.replace(/[<>:"/\\|?*]/g, '');
  const filePath = path.join(downloadDir, fileName);
  try {
    await fs.access(filePath);
    return { exists: true, fileName };
  } catch {
    return { exists: false, fileName };
  }
}

// 目录/文件名清洗：移除 Windows 与 Linux 非法字符，使用空格替换规避字符
export function sanitizePathName(name: string): string {
  // Windows 禁用:  < > : " / \ | ? * 以及结尾点或空格
  // Linux/Unix 仅禁止 '/'
  let sanitized = name.replace(/[<>:"/\\|?*]/g, ' ');
  // 控制字符与非打印字符
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, ' ');
  // 合并多余空格并修剪
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  // Windows 特定保留名避让（CON、PRN、AUX、NUL、COM1..COM9、LPT1..LPT9）
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(sanitized)) {
    sanitized = `${sanitized} -`;
  }
  // 尾部点或空格在 Windows 不合法
  sanitized = sanitized.replace(/[ .]+$/g, '');
  if (sanitized.length === 0) sanitized = 'untitled';
  return sanitized;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}