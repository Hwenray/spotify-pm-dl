import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';

// 酷狗API管理器
export class KugouApiManager {
  private apiProcess: ChildProcess | null = null;
  private readonly apiPath: string;
  private readonly apiUrl: string = 'http://localhost:3000';
  private readonly maxStartupTime: number = 30000; // 30秒启动超时

  constructor() {
    this.apiPath = path.resolve('KuGouMusicApi');
  }

  /**
   * 检查KuGouMusicApi目录是否存在
   */
  async checkApiExists(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.apiPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 检查API服务是否运行
   */
  async isApiRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/`, { timeout: 3000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 启动酷狗API服务
   */
  async startApi(): Promise<boolean> {
    // 检查API目录是否存在
    if (!await this.checkApiExists()) {
      console.log(chalk.red('❌ KuGouMusicApi目录不存在'));
      console.log(chalk.yellow('请先运行: git submodule add https://github.com/MakcRe/KuGouMusicApi KuGouMusicApi'));
      console.log(chalk.yellow('然后运行: git submodule update --init --recursive'));
      return false;
    }

    // 检查是否已经在运行
    if (await this.isApiRunning()) {
      console.log(chalk.green('✅ 酷狗API服务已在运行'));
      return true;
    }

    console.log(chalk.blue('🚀 启动酷狗API服务...'));

    try {
      // 检查package.json是否存在
      const packageJsonPath = path.join(this.apiPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
      } catch {
        console.log(chalk.yellow('⚠ 检测到KuGouMusicApi依赖未安装，正在安装...'));
        await this.installDependencies();
      }

      // 启动API服务
      this.apiProcess = spawn('npm', ['run', 'dev'], {
        cwd: this.apiPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: false
      });

      // 等待服务启动
      const started = await this.waitForApiStart();
      
      if (started) {
        console.log(chalk.green('✅ 酷狗API服务启动成功'));
        
        // 设置进程退出时清理
        process.on('exit', () => this.stopApi());
        process.on('SIGINT', () => {
          this.stopApi();
          process.exit(0);
        });
        process.on('SIGTERM', () => this.stopApi());
        
        return true;
      } else {
        console.log(chalk.red('❌ 酷狗API服务启动失败'));
        this.stopApi();
        return false;
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ 启动酷狗API服务时出错: ${error.message}`));
      return false;
    }
  }

  /**
   * 安装API依赖
   */
  private async installDependencies(): Promise<void> {
    return new Promise((resolve, reject) => {
      const installProcess = spawn('npm', ['install'], {
        cwd: this.apiPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let output = '';
      let errorOutput = '';

      if (installProcess.stdout) {
        installProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
      }

      if (installProcess.stderr) {
        installProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
      }

      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✅ 依赖安装完成'));
          resolve();
        } else {
          console.log(chalk.red('❌ 依赖安装失败'));
          console.log(chalk.gray(errorOutput));
          reject(new Error(`依赖安装失败，退出码: ${code}`));
        }
      });

      installProcess.on('error', (error) => {
        reject(new Error(`无法启动npm install: ${error.message}`));
      });
    });
  }

  /**
   * 等待API服务启动
   */
  private async waitForApiStart(): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // 每秒检查一次

    while (Date.now() - startTime < this.maxStartupTime) {
      if (await this.isApiRunning()) {
        return true;
      }
      
      // 检查进程是否还在运行
      if (this.apiProcess && this.apiProcess.killed) {
        console.log(chalk.red('❌ API进程意外退出'));
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  /**
   * 停止API服务
   */
  stopApi(): void {
    if (this.apiProcess && !this.apiProcess.killed) {
      console.log(chalk.yellow('🛑 正在停止酷狗API服务...'));
      
      // 在Windows上需要特殊处理
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', this.apiProcess.pid!.toString(), '/f', '/t'], {
          stdio: 'ignore'
        });
      } else {
        this.apiProcess.kill('SIGTERM');
      }
      
      this.apiProcess = null;
    }
  }

  /**
   * 获取API基础URL
   */
  getApiUrl(): string {
    return this.apiUrl;
  }
}

// 导出单例实例
export const kugouApiManager = new KugouApiManager();