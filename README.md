# spotify-pm-dl
基于 Node.js + Typescript 的脚本，支持获取 Spotify 歌单中的所有歌曲并通过 Aria2 下载，支持搜索单曲下载。

- 获取并下载 Spotify 歌单中的全部歌曲（通过 Aria2）
- 支持关键词搜索 Spotify 单曲并下载
- 自动跳过已下载歌曲，支持断点重试

## 项目特性

### 🎧 核心功能
- **歌单下载**: 获取并下载 Spotify 歌单中的全部歌曲
- **专辑/EP 下载**: 支持下载完整专辑或 EP
- **单曲搜索**: 关键词搜索 Spotify 单曲并下载
- **智能跳过**: 自动跳过已下载歌曲，支持断点重试

### 🎵 下载特性
- **高质量音频**: 使用 yt-dlp 从 YouTube 等平台抽取音频（默认 MP3 格式）
- **目录管理**: 下载歌单/专辑时自动创建以名称命名的子目录
- **路径清洗**: 目录名会按 Windows/Linux 规则自动清洗
- **多平台兼容**: 支持 Windows 和 Linux 系统

### 🏷️ 元数据管理
- **ID3v2.4 标签**: 可选自动刮削并写入完整元数据标签（`-s/--scratch`）
- **专辑封面**: 自动下载并嵌入 300px 专辑封面图片
- **原始名称**: 去英文化处理，从 MusicBrainz 等平台查询原始名称（`-o/--original`）
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
npm i
```
# 编译
```bash
npx tsc
```
# 赋予执行权限
```bash
chmod +x dist/main.js
```
> 读取不到变量时
```bash
source .env
```
# 命令
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
```
npx dl search "Song title"
# 或者
npx dl s "Song Title"
# 精准定位
npx dl s "Song Title Artist Name"
# 自动刮削 + 去英文化
npx dl s "Song Title Artist Name" -s -o
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

Aria2（可选）：旧版本流程使用 Aria2，现在默认下载不再依赖 Aria2

默认通过 yt-dlp 从 YouTube 抽取音频；如需提升可访问性，可配置可选环境变量 `YTDLP_COOKIES`

开启 `-s/--scratch` 时需要系统安装 `ffmpeg`（用于写入 ID3v2.4 标签与封面）

本项目仅用于学习交流，请勿用于商业用途