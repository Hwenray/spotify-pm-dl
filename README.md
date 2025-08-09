# spotify-pm-dl
基于 Node.js + Typescript 的脚本，支持获取 Spotify 歌单中的所有歌曲并通过 Aria2 下载，支持搜索单曲下载。

- 获取并下载 Spotify 歌单中的全部歌曲（通过 Aria2）
- 支持关键词搜索 Spotify 单曲并下载
- 自动跳过已下载歌曲，支持断点重试

## 新增特性
- 使用 yt-dlp 搜索并抽取音频（默认保存为 mp3），支持可选 `YTDLP_COOKIES`
- 下载歌单、专辑/EP 时自动创建以歌单/专辑名命名的子目录；目录名会按 Windows/Linux 规则清洗
- 新增命令：`dl album <url>`（别名 `a`）下载专辑/EP
- 直接传入 Spotify URL 时，自动识别歌单或专辑

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
```
> 下载专辑/EP
```bash
npx dl album <Album link>
# 或者
npx dl a <Album link>
```
> 直接传入 URL（自动识别歌单/专辑）
```bash
# 歌单
npx dl https://open.spotify.com/playlist/xxxxxxxxxxxx
# 专辑/EP
npx dl https://open.spotify.com/album/xxxxxxxxxxxx
```
> 搜索下载单曲
```
npx dl search "Song title"
# 或者
npx dl s "Song Title"
# 精准定位
npx dl s "Song Title Artist Name"
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

本项目仅用于学习交流，请勿用于商业用途