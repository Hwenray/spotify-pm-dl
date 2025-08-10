# spotify-pm-dl

🎵 **全新升级！** 基于 Node.js + TypeScript 的强大音乐下载工具，现已完全集成酷狗音乐API！

## ✨ 主要亮点

- 🆕 **一键酷狗集成**: 无需手动启动外部服务，自动管理酷狗音乐API
- 🎯 **双源下载**: YouTube Music + 酷狗音乐，确保下载成功率
- 🏷️ **智能元数据**: 酷狗元数据优先，完美支持中文/日文/韩文去英文化
- 📱 **便捷登录**: 酷狗音乐APP扫码登录，状态自动保存
- 🎶 **全功能支持**: 歌单、专辑、单曲搜索下载一应俱全

## 项目特性

### 🎧 核心功能
- **歌单下载**: 获取并下载 Spotify 歌单中的全部歌曲
- **专辑/EP 下载**: 支持下载完整专辑或 EP
- **单曲搜索**: 关键词搜索 Spotify 单曲并下载
- **智能跳过**: 自动跳过已下载歌曲，支持断点重试

### 🎵 下载特性
- **🆕 一键酷狗集成**: 全新集成酷狗音乐API，无需手动启动外部服务
- **多源下载**: 支持 YouTube Music (yt-dlp) 和酷狗音乐双重下载源
- **智能备用**: YouTube 无法获取时自动切换到酷狗音乐
- **自动API管理**: 酷狗API服务自动启动和进程管理
- **高质量音频**: 使用 yt-dlp 从 YouTube 等平台抽取音频（默认 MP3 格式）
- **目录管理**: 下载歌单/专辑时自动创建以名称命名的子目录
- **路径清洗**: 目录名会按 Windows/Linux 规则自动清洗
- **多平台兼容**: 支持 Windows 和 Linux 系统

### 🏷️ 元数据管理
- **ID3v2.4 标签**: 可选自动刮削并写入完整元数据标签（`--scratch`）
- **专辑封面**: 自动下载并嵌入 300px 专辑封面图片
- **🆕 智能去英文化**: 优先使用酷狗音乐元数据，从 MusicBrainz 和酷狗音乐查询原始名称（`--original`）
- **🆕 付费歌曲元数据**: 即使酷狗歌曲付费，仍可获取元数据用于去英文化
- **UTF-8 编码**: 确保中文元数据正确显示

### 🚀 使用便利
- **命令行界面**: 简洁直观的 CLI 操作体验
- **URL 自动识别**: 直接传入 Spotify URL，自动识别歌单或专辑
- **交互式选择**: 搜索结果多个时支持交互式选择
- **进度显示**: 实时显示下载进度和统计信息
- **错误处理**: 完善的错误处理和重试机制

### 🔧 技术特性
- **TypeScript 开发**: 类型安全，代码可靠
- **模块化设计**: 代码结构清晰，易于维护和扩展
- **环境配置**: 通过 .env 文件灵活配置
- **Cookie 支持**: 可选配置 YTDLP_COOKIES 提升可访问性


- 使用 yt-dlp 搜索并抽取音频（默认保存为 mp3），支持可选 `YTDLP_COOKIES`
- 下载歌单、专辑/EP 时自动创建以歌单/专辑名命名的子目录；目录名会按 Windows/Linux 规则清洗
- 新增命令：`dl album <url>`（别名 `a`）下载专辑/EP
- 直接传入 Spotify URL 时，自动识别歌单或专辑
- 可选自动刮削与封面写入（`-s/--scratch`）：抓取 Spotify 元数据并写入 ID3v2.4 UTF-8 标签（优先 300px 封面）
- 可选去英文化（`-o/--original`）：从外部平台（如 MusicBrainz）查询原始名称，替换标签并重命名文件（会输出原名与新名以便核对）

---

# 安装依赖
```bash
npm install
```

# 设置酷狗音乐功能（可选但推荐）
```bash
npm run setup-kugou
```

# 编译
```bash
npm run build
```

# 赋予执行权限（Linux/macOS）
```bash
chmod +x dist/main.js
```

> 读取不到变量时
```bash
source .env
```
# 命令

## 酷狗音乐集成
项目现已支持酷狗音乐作为备用下载源：

### 使用前准备
1. **启动酷狗API服务**：
   ```bash
   git clone https://github.com/MakcRe/KuGouMusicApi.git
   cd KuGouMusicApi
   npm install
   npm run dev  # 默认运行在 http://localhost:3000
   ```

2. **首次使用时登录**：
   当你第一次运行下载命令时，程序会自动检测酷狗登录状态。如果未登录，会提示：
   
   ```
   🎵 开始酷狗音乐登录流程...
   ? 请选择登录方式: (Use arrow keys)
   ❯ 用户名密码登录
     手机号登录  
     二维码登录
   ```

### 登录方式说明

**重要提醒**：目前由于酷狗API服务限制，仅支持**二维码登录**方式。用户名密码登录和手机号登录暂时不可用。

#### 二维码登录
```bash
🎵 开始酷狗音乐登录流程...
⚠ 注意：目前仅支持二维码登录方式
? 是否使用二维码登录酷狗音乐？ (Y/n)
📱 请使用酷狗音乐APP扫描二维码登录:

二维码Key: 77d2dd2cb5aa067666a80b229838b0d21001
尝试二维码格式: https://login.kugou.com/qr?key=77d2dd2cb5aa067...

█████████████████████████████████
██ ▄▄▄▄▄ █▀▀██ █▀▀▀█▀▄█ ▄▄▄▄▄ ██
██ █   █ █ ▄ █▄▀█▀▄█▄▄▄█ █   █ ██
██ █▄▄▄█ █▄█▄█▀ ▀█▄██▄▀█ █▄▄▄█ ██
[二维码在终端中显示]

💡 提示：
1. 打开酷狗音乐APP
2. 进入扫码页面  
3. 扫描上方二维码或输入Key: 77d2dd2cb5aa067...

📱 扫码完成后，请按回车键继续...
? 扫码完成后按回车继续 
🔄 正在检查登录状态...
👀 已扫码，等待确认...
✅ 登录成功！
```

**备用方案**：如果终端无法显示二维码，程序会自动保存二维码为图片文件 `temp_qrcode.png`，您可以用图片查看器打开后扫描。

### 登录状态管理
- **自动保存**：登录信息保存在项目根目录的 `kugou-auth.json` 文件
- **有效期**：登录状态有效期为7天，过期后需重新登录
- **状态检查**：每次使用时自动检查登录状态
- **重新登录**：可删除 `kugou-auth.json` 文件强制重新登录

### 酷狗登录管理命令

项目提供了专门的命令来管理酷狗音乐的登录状态：

#### 基本命令
```bash
# 查看登录状态
npx dl kugou --status
# 或简写
npx dl kg -s

# 强制登录（会覆盖现有登录）
npx dl kugou --login
# 或简写  
npx dl kg -l

# 退出登录
npx dl kugou --logout
# 或简写
npx dl kg -o
```

#### 交互式管理
```bash
# 打开交互式登录管理菜单
npx dl kugou
# 或简写
npx dl kg
```

交互式管理会显示：
- **已登录时**：提供重新登录、退出登录、取消等选项
- **未登录时**：提供立即登录、取消等选项

#### 使用示例

**查看当前登录状态**：
```bash
$ npx dl kg -s
✅ 酷狗音乐已登录
```

**重新登录**：
```bash
$ npx dl kg -l
🔄 开始酷狗音乐登录...
⚠ 注意：目前仅支持二维码登录方式
? 是否使用二维码登录酷狗音乐？ Yes
[显示二维码...]
✅ 酷狗音乐登录成功！
```

**退出登录**：
```bash
$ npx dl kg -o
✅ 已退出酷狗音乐登录
```

**交互式管理**：
```bash
$ npx dl kg
🎵 酷狗音乐登录管理
✅ 当前状态：已登录
? 选择操作: (Use arrow keys)
❯ 重新登录
  退出登录
  取消
```

### 参数说明
- `-k, --kugou`: 优先使用酷狗音乐作为下载源
- `--debug`: 输出详细的调试信息，帮助排查问题
- 不使用 `-k` 时，酷狗作为 YouTube 的备用源

#### 调试模式 (--debug)
当下载遇到问题时，可以使用 `--debug` 参数来获取详细的调试信息：

```bash
# 调试单曲下载
npx dl search "歌曲名" --debug

# 调试酷狗优先下载
npx dl search "歌曲名" -k --debug

# 调试歌单下载
npx dl playlist "歌单链接" --debug
```

调试模式会输出：
- 🔍 **DEBUG**: 主要流程调试信息
- 🔍 **KUGOU DEBUG**: 酷狗音乐相关调试信息
- API调用详情、搜索结果、下载链接获取过程等

#### 使用 -k 参数时的行为
- **未登录时**：会提示登录酷狗音乐
- **已登录时**：会显示登录管理选项，可选择：
  - 使用当前登录状态
  - 重新登录
  - 退出登录

```bash
# 使用酷狗优先下载（已登录状态）
$ npx dl search "歌曲名" -k
✅ 酷狗音乐已登录
? 选择操作: (Use arrow keys)
❯ 使用当前登录状态
  重新登录
  退出登录
```

> 下载歌单
```bash
npx dl playlist <Playlist link>
# 或者
npx dl p <Playlist link>
# 自动刮削 + 去英文化
npx dl playlist <Playlist link> -s -o
```
> 下载专辑/EP
```bash
npx dl album <Album link>
# 或者
npx dl a <Album link>
# 自动刮削 + 去英文化
npx dl album <Album link> -s -o
```
> 直接传入 URL（自动识别歌单/专辑）
```bash
# 歌单
npx dl https://open.spotify.com/playlist/xxxxxxxxxxxx
# 专辑/EP
npx dl https://open.spotify.com/album/xxxxxxxxxxxx
# 与选项一起使用（例：刮削 + 去英文化）
npx dl https://open.spotify.com/album/xxxxxxxxxxxx -s -o
```
> 搜索下载单曲
```bash
# 基本搜索（支持多个关键词，无需引号）
npx dl search bow and arrow
npx dl search Song Title Artist Name

# 使用引号搜索（推荐用于包含特殊字符的搜索）
npx dl search "Song title"

# 简写形式（使用 find 别名）
npx dl find bow and arrow

# 🆕 酷狗音乐优先搜索和下载
npx dl search song title --kugou

# 🆕 酷狗 + 自动刮削 + 去英文化（推荐组合）
npx dl search "日文歌曲" --kugou --scratch --original

# 输出详细调试信息
npx dl search song title --debug

# 🆕 完整功能组合：酷狗优先 + 刮削 + 去英文化 + 调试模式
npx dl search bow and arrow --kugou --scratch --original --debug
```
---
# 配置环境变量
请在项目根目录创建 .env 文件（可参考 .env.example）：

```Dotenv
# === Spotify API 配置 ===
SPOTIFY_CLIENT_ID=xxxxx
SPOTIFY_CLIENT_SECRET=xxxxxx

# === Aria2 RPC 配置 ===
ARIA2_RPC_URL=http://localhost:6800/jsonrpc
ARIA2_TOKEN=your_aria2_secret_token

# === 下载目录（绝对路径）===
DOWNLOAD_DIR=/absolute/path/to/your/downloads

# === 可选：YouTube-DLP Cookie 文件路径（如果你用得到）===
# YTDLP_COOKIES=./cookies.txt
```
---
# 提示
请确保本机已安装并可执行 `yt-dlp`（在终端可运行 `yt-dlp --version`）

## 🎵 酷狗音乐集成

### ✨ 新特性：一键集成酷狗音乐API

本项目现已完全集成酷狗音乐API，无需手动启动外部服务！

### 🚀 快速设置

**一键设置酷狗音乐功能**：
```bash
npm run setup-kugou
```

这个命令会自动完成：
- ✅ 添加KuGouMusicApi作为git submodule
- ✅ 初始化和更新submodule  
- ✅ 安装必要的依赖
- ✅ 配置API服务

**验证设置**：
```bash
npm run test-kugou
```

### 🎯 使用方式

设置完成后，直接使用即可（API会自动启动）：

```bash
# 优先使用酷狗音乐下载
npx dl search "歌曲名" --kugou

# 酷狗 + 元数据刮削 + 去英文化
npx dl search "日文歌曲" --kugou --scratch --original

# 下载歌单（酷狗优先）
npx dl playlist "歌单链接" --kugou --scratch --original
```

### 🔧 手动设置（备用方案）

如果自动设置失败，可以手动执行：
```bash
# 添加酷狗音乐API作为submodule
git submodule add https://github.com/MakcRe/KuGouMusicApi KuGouMusicApi

# 初始化submodule
git submodule update --init --recursive

# 安装API依赖
cd KuGouMusicApi && npm install && cd ..

# 编译项目
npm run build
```

### 🌟 核心特性

#### 🤖 智能API管理
- **自动启动**: 首次使用时自动启动酷狗API服务
- **进程管理**: 程序退出时自动清理API进程
- **状态检测**: 智能检测API服务运行状态

#### 🔐 便捷登录管理
- **二维码登录**: 支持酷狗音乐APP扫码登录
- **状态持久化**: 登录状态自动保存，7天有效期
- **登录管理命令**: 专门的登录管理工具

```bash
# 查看登录状态
npx dl kugou --status

# 登录酷狗音乐  
npx dl kugou --login

# 退出登录
npx dl kugou --logout

# 交互式登录管理
npx dl kugou
```

#### 🎶 强大下载功能
- **多源保障**: YouTube Music + 酷狗音乐双重下载源
- **智能回退**: 酷狗失败时自动切换YouTube
- **版权处理**: 智能处理付费/版权限制歌曲
- **高质量音频**: 支持128kbps MP3格式

#### 🏷️ 增强元数据功能
- **智能去英文化**: 使用酷狗元数据获取中文/日文/韩文原名
- **付费歌曲元数据**: 即使歌曲付费无法下载，仍可获取元数据用于去英文化
- **完整ID3标签**: ID3v2.4 UTF-8标签 + 专辑封面嵌入

### 📋 酷狗登录管理

#### 首次使用登录流程
```bash
npx dl search "歌曲名" --kugou
# 系统会自动提示登录，支持二维码扫码
```

#### 登录管理命令
```bash
# 查看当前登录状态
npx dl kugou --status

# 强制重新登录
npx dl kugou --login

# 退出当前登录
npx dl kugou --logout

# 交互式登录管理菜单
npx dl kugou
```

#### 登录方式说明
- **二维码登录**：使用酷狗音乐APP扫描终端显示的二维码
- **自动保存**：登录信息保存在 `kugou-auth.json` 文件
- **有效期管理**：登录状态有效期7天，过期自动提示重新登录

### 🛠️ 故障排除

#### 常见问题解决

**问题1: KuGouMusicApi目录不存在**
```bash
npm run setup-kugou
```

**问题2: API服务启动失败**
```bash
cd KuGouMusicApi && npm install && cd ..
npm run test-kugou
```

**问题3: 登录失败或过期**
```bash
npx dl kugou --logout
npx dl kugou --login
```

**问题4: 端口3000被占用**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <进程ID> /F

# Linux/macOS  
lsof -ti:3000 | xargs kill -9
```

### 📚 更多信息

详细的设置指南和故障排除，请参考：[KUGOU_SETUP.md](KUGOU_SETUP.md)

Aria2（可选）：旧版本流程使用 Aria2，现在默认下载不再依赖 Aria2

默认通过 yt-dlp 从 YouTube 抽取音频；如需提升可访问性，可配置可选环境变量 `YTDLP_COOKIES`

开启 `-s/--scratch` 时需要系统安装 `ffmpeg`（用于写入 ID3v2.4 标签与封面）

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone <your-repo-url>
cd spotify-pm-dl
```

### 2. 安装依赖
```bash
npm install
```

### 3. 设置酷狗音乐（推荐）
```bash
npm run setup-kugou
```

### 4. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 Spotify API 密钥
```

### 5. 编译项目
```bash
npm run build
```

### 6. 开始使用
```bash
# 搜索并下载单曲（酷狗优先 + 完整元数据）
npx dl search "歌曲名" --kugou --scratch --original

# 下载 Spotify 歌单
npx dl playlist "https://open.spotify.com/playlist/xxxxx" --kugou --scratch --original

# 下载 Spotify 专辑
npx dl album "https://open.spotify.com/album/xxxxx" --kugou --scratch --original
```

### 7. 酷狗音乐登录（首次使用）
首次使用酷狗功能时，系统会自动提示登录：
- 使用酷狗音乐APP扫描终端显示的二维码
- 登录状态会自动保存，有效期7天

---

## ⚖️ 免责声明

本项目仅用于学习交流，请勿用于商业用途