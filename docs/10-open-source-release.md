# 开源发布说明

版本：0.1
日期：2026-11-24

## 已完成的发布准备

- MIT 许可证
- README 产品说明与运行方式
- 贡献、安全和隐私文档
- GitHub Actions CI
- Docker 与 Docker Compose 自托管
- 页面内 DeepSeek Key 配置
- 生产模式由 FastAPI 托管构建后的前端
- 本地课程资料和模型配置加入 Git ignore

## 不应提交的数据

- `local-samples/` 中的真实课件
- 真题图片和生成结果
- `local-data/` Docker 数据卷
- `.env`
- 完整 API Key
- `screenshots/` 中的本地验收截图

## 首次发布前仍需人工确认

1. 选择公开仓库名称。
2. 设置 Git 提交者姓名与邮箱。
3. 创建 GitHub 仓库并添加远程地址。
4. 检查默认分支为 `main`。
5. 验证 GitHub Actions 首次运行通过。
6. 确认 README 截图不包含个人资料。
7. 决定是否发布 Docker 镜像。

## 建议发布文案

> 知卷是一个本地优先的理工科 AI 复习工作台。上传课件和可选真题，生成有来源的知识导图与模拟试卷。用户自带 DeepSeek Key，课程资料与模型配置默认留在本地。

## 当前尚未完成

- 用户账号和公共云部署
- 进行中考试的跨刷新恢复
- DOCX 上传
- 大学物理内置样例
- 图形安装包
