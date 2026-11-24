# 安装与开源可用性检查

版本：0.1
日期：2026-11-24

## 已修复的安装问题

### Node.js 版本

Vite 7.3.8 要求 Node.js `20.19+` 或 `22.12+`。项目原先只声明 `20+`，可能让用户使用不兼容版本。已修正项目 `engines`。

### 跨平台后端启动

原启动命令使用 Windows 专属 `py`。现由 `scripts/run-api.mjs` 依次检测：

- `PYTHON` 环境变量
- `py`
- `python3`
- `python`

Windows、Linux 和 macOS 均可使用 `npm run dev:api`。

### 环境变量文件

后端现在会读取项目根目录的 `.env`。没有 `.env` 时继续使用系统环境变量或页面设置。

### 端口冲突

后端和 Vite 代理均支持 `API_PORT`。默认 `8010` 被占用时可设置：

```powershell
$env:API_PORT = "8020"
npm run dev:api
```

## 已验证

- `npm ci --dry-run`
- Python 后端依赖 dry-run
- 前端生产构建
- FastAPI 托管构建后的前端
- 设置页连接测试
- 桌面和手机浏览器回归
- Python 契约测试
- `npm audit --omit=dev` 为 0

## 当前无法自动验证

本机没有安装 Docker，因此 Dockerfile 和 Docker Compose 只经过静态检查，尚未实际执行 `docker compose up --build`。

## 仍缺少的产品能力

以下不是安装错误，但属于公开发布后的功能缺口：

- 没有“新建任意课程”的表单，上传资料目前主要用于当前课程
- GitHub 公开仓库没有附带真实课件，线性代数样例只在本地测试环境可用
- 大学物理样例尚未接入
- 错题本、收藏和历史导航仍是禁用状态
- 进行中的考试不能跨页面刷新恢复
- PPTX 中的 OLE 公式尚未实现跨平台自动页面渲染

建议在公开宣传时把当前版本标记为预览版，避免声称已经完全支持所有理工科课程。
