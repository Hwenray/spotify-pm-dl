#!/usr/bin/env node

import { kugouApiManager } from '../dist/src/dl-script/kugou-api-manager.js';
import chalk from 'chalk';

async function testKugouIntegration() {
  console.log(chalk.blue('🧪 测试酷狗音乐集成...'));

  try {
    // 检查API目录是否存在
    console.log(chalk.blue('1. 检查KuGouMusicApi目录...'));
    const apiExists = await kugouApiManager.checkApiExists();
    
    if (!apiExists) {
      console.log(chalk.red('❌ KuGouMusicApi目录不存在'));
      console.log(chalk.yellow('请先运行: npm run setup-kugou'));
      return false;
    }
    
    console.log(chalk.green('✅ KuGouMusicApi目录存在'));

    // 检查API是否运行
    console.log(chalk.blue('2. 检查API服务状态...'));
    const isRunning = await kugouApiManager.isApiRunning();
    
    if (isRunning) {
      console.log(chalk.green('✅ API服务已在运行'));
    } else {
      console.log(chalk.yellow('⚠ API服务未运行，尝试启动...'));
      
      const started = await kugouApiManager.startApi();
      if (started) {
        console.log(chalk.green('✅ API服务启动成功'));
      } else {
        console.log(chalk.red('❌ API服务启动失败'));
        return false;
      }
    }

    console.log(chalk.green('🎉 酷狗音乐集成测试通过！'));
    console.log(chalk.yellow('💡 现在可以使用 -k 参数启用酷狗音乐功能'));
    
    // 停止API服务
    kugouApiManager.stopApi();
    
    return true;

  } catch (error) {
    console.log(chalk.red('❌ 测试失败:'), error.message);
    return false;
  }
}

// 运行测试
testKugouIntegration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(chalk.red('测试出错:'), error);
    process.exit(1);
  });