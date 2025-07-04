# spotify-pm-dl
基于 Node.js + Typescript 的脚本，支持获取 Spotify 歌单中的所有歌曲并通过 Aria2 下载，支持搜索单曲下载。

- 获取并下载 Spotify 歌单中的全部歌曲（通过 Aria2）
- 支持关键词搜索 Spotify 单曲并下载
- 自动跳过已下载歌曲，支持断点重试

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
请确保 Aria2 已启动并开启 RPC 接口

下载链接通过第三方服务获取，需保持网络正常

本项目仅用于学习交流，请勿用于商业用途