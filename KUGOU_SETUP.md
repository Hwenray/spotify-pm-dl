# 酷狗音乐集成设置指南

## 🚀 快速开始

### 1. 自动设置（推荐）

运行一键设置命令：
```bash
npm run setup-kugou
```

### 2. 验证设置

测试酷狗音乐集成是否正常：
```bash
npm run test-kugou
```

### 3. 开始使用

现在你可以使用酷狗音乐功能了：
```bash
# 优先使用酷狗音乐下载
npx dl search "歌曲名" --kugou

# 酷狗音乐 + 元数据刮削 + 去英文化
npx dl search "日文歌曲" --kugou --scratch --original
```

## 🔧 手动设置

如果自动设置失败，请按以下步骤手动设置：

### 步骤1: 添加Submodule
```bash
git submodule add https://github.com/MakcRe/KuGouMusicApi KuGouMusicApi
```

### 步骤2: 初始化Submodule
```bash
git submodule update --init --recursive
```

### 步骤3: 安装依赖
```bash
cd KuGouMusicApi
npm install
cd ..
```

### 步骤4: 编译项目
```bash
npm run build
```

## 📋 功能特性

### 🎵 自动API管理
- **自动启动**: 首次使用时自动启动酷狗API服务
- **智能检测**: 自动检测API服务状态
- **进程管理**: 程序退出时自动清理API进程

### 🔐 登录管理
- **二维码登录**: 支持酷狗音乐APP扫码登录
- **状态持久化**: 登录状态自动保存，7天有效期
- **登录管理**: 提供专门的登录管理命令

### 🎶 下载功能
- **多源下载**: YouTube Music + 酷狗音乐双重保障
- **智能回退**: 酷狗失败时自动切换YouTube
- **版权处理**: 智能处理付费/版权限制歌曲

### 🏷️ 元数据增强
- **去英文化**: 使用酷狗元数据进行中文/日文/韩文去英文化
- **智能元数据**: 即使下载失败也能获取元数据用于去英文化
- **ID3标签**: 完整的ID3v2.4 UTF-8标签支持

## 🛠️ 故障排除

### 问题1: KuGouMusicApi目录不存在
```bash
# 解决方案
git submodule add https://github.com/MakcRe/KuGouMusicApi KuGouMusicApi
git submodule update --init --recursive
```

### 问题2: API服务启动失败
```bash
# 检查依赖是否安装
cd KuGouMusicApi
npm install

# 手动启动测试
npm run dev
```

### 问题3: 端口被占用
```bash
# 检查端口3000是否被占用
netstat -ano | findstr :3000

# 结束占用进程（Windows）
taskkill /PID <进程ID> /F
```

### 问题4: 登录失败
```bash
# 清除登录状态重新登录
npx dl kugou --logout
npx dl kugou --login
```

## 📚 命令参考

### 基本使用
```bash
# 搜索并下载（酷狗优先）
npx dl search "歌曲名" --kugou

# 下载歌单（酷狗优先）
npx dl playlist "歌单链接" --kugou

# 下载专辑（酷狗优先）
npx dl album "专辑链接" --kugou
```

### 登录管理
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

### 高级功能
```bash
# 酷狗 + 元数据刮削
npx dl search "歌曲名" --kugou --scratch

# 酷狗 + 去英文化
npx dl search "日文歌曲" --kugou --original

# 完整功能组合
npx dl search "歌曲名" --kugou --scratch --original --debug
```

## 🔄 更新Submodule

定期更新KuGouMusicApi到最新版本：
```bash
git submodule update --remote KuGouMusicApi
cd KuGouMusicApi
npm install
cd ..
npm run build
```

## 📞 技术支持

如果遇到问题，请：
1. 运行 `npm run test-kugou` 检查集成状态
2. 使用 `--debug` 参数查看详细日志
3. 检查 `KuGouMusicApi` 目录是否存在且完整
4. 确认网络连接正常，能访问GitHub和酷狗服务