# Contributing

感谢你愿意改进知卷。提交代码前请先确认改动符合本项目的核心原则：

- 课程资料默认留在本地。
- 用户自行提供模型 Key。
- AI 输出必须经过结构化校验。
- 无法确认的内容要标记，不允许伪造来源。

## 开发环境

1. 安装 Node.js `20.19+`（或 `22.12+`）与 Python 3.11+。
2. 安装依赖：

```powershell
npm install
py -m pip install -r backend/requirements.txt
```

Linux/macOS 将 `py -m pip` 替换为 `python3 -m pip`。

3. 启动后端。启动脚本会自动检测 Python：

```powershell
npm run dev:api
```

4. 另开终端启动前端：

```powershell
npm run dev
```

## 提交前检查

```powershell
npm run build
npm run qa:visual
npm run qa:exam-layout
npm run qa:math
npm audit --omit=dev
py -m unittest validation/test_validate_contracts.py validation/test_validate_exam_profile.py -v
```

浏览器测试需要本机安装 Chrome。端到端 AI 测试还需要模型 Key 和 `local-samples/` 中的本地测试资料。

真实模型测试需要自行配置 Key。不要提交 Key、用户课件、生成的课程数据或 `local-samples/` 内容。

## Pull Request

- 保持改动范围清晰。
- UI 改动附桌面和手机截图。
- AI 或数据结构改动补充对应校验和测试。
- 不提交无关格式化或依赖升级。
