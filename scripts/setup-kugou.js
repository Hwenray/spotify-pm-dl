#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue(`执行: ${command} ${args.join(' ')}`));
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`命令执行失败，退出码: ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function checkGitSubmodule() {
  const kugouApiPath = path.resolve('KuGouMusicApi');
  
  try {
    const stats = fs.statSync(kugouApiPath);
    if (stats.isDirectory()) {
      console.log(chalk.green('✅ KuGouMusicApi目录已存在'));
      return true;
    }
  } catch {
    // 目录不存在
  }
  
  return false;
}

async function setupKugouApi() {
  console.log(chalk.blue('🎵 设置酷狗音乐API...'));
  
  try {
    // 检查是否已经存在
    if (await checkGitSubmodule()) {
      console.log(chalk.yellow('KuGouMusicApi已存在，跳过添加步骤'));
    } else {
      // 添加submodule
      console.log(chalk.blue('📦 添加KuGouMusicApi作为git submodule...'));
      await runCommand('git', [
        'submodule', 
        'add', 
        'https://github.com/MakcRe/KuGouMusicApi', 
        'KuGouMusicApi'
      ]);
    }

    // 初始化和更新submodule
    console.log(chalk.blue('🔄 初始化和更新submodule...'));
    await runCommand('git', ['submodule', 'update', '--init', '--recursive']);

    // 安装依赖
    console.log(chalk.blue('📦 安装KuGouMusicApi依赖...'));
    await runCommand('npm', ['install'], { cwd: 'KuGouMusicApi' });

    console.log(chalk.green('✅ 酷狗音乐API设置完成！'));
    console.log(chalk.yellow('💡 现在你可以直接使用 -k 参数来启用酷狗音乐功能'));
    console.log(chalk.gray('   例如: npx dl search "歌曲名" -k'));

  } catch (error) {
    console.log(chalk.red('❌ 设置失败:'), error.message);
    console.log(chalk.yellow('请手动执行以下命令:'));
    console.log(chalk.gray('  git submodule add https://github.com/MakcRe/KuGouMusicApi KuGouMusicApi'));
    console.log(chalk.gray('  git submodule update --init --recursive'));
    console.log(chalk.gray('  cd KuGouMusicApi && npm install'));
    process.exit(1);
  }
}

// 运行设置
setupKugouApi().catch(console.error);