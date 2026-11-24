# 数据契约验证

此目录用于在正式应用开发前验证生成结果的结构约束，不调用任何 AI 服务。

当前覆盖：

- 线性代数：矩阵公式、计算题和证明题
- 大学物理：公式、图片依据、计算题和实验题
- 面向对象程序设计：代码阅读和设计题

验证内容：

- 课程、知识图谱、考试蓝图和试卷的关联有效
- 蓝图题量、单题分值和总分一致
- 试卷题目数量与题型符合蓝图
- 题目引用的知识点存在
- 资料型知识节点和题目具有有效来源
- 不存在伪造的文件或页面引用
- 自动判分题具有答案
- 代码课程记录编程语言和框架

运行：

```powershell
py validation/validate_contracts.py
py -m unittest validation/test_validate_contracts.py -v
```

在非 Windows 环境或命令名为 `python` 的环境中，将 `py` 替换为 `python`。

## 检查本地资料

```powershell
py validation/inspect_sources.py local-samples --output local-samples/source-inventory.json
py validation/extract_sources.py
py validation/validate_exam_profile.py local-samples/linear-algebra/exam-profile.golden.json
```

DeepSeek 真实能力探测：

```powershell
py validation/deepseek_probe.py models
py validation/deepseek_probe.py text
py validation/deepseek_probe.py physics
py validation/deepseek_probe.py exam
py validation/deepseek_probe.py knowledge-oop
py validation/deepseek_probe.py mini-exam-oop
```

Key 从 `DEEPSEEK_API_KEY` 环境变量读取，不会写入项目文件或探测结果。

`extract_sources.py` 会在 `local-samples/extracted/` 输出标准化文字、页码、图片数量和解析质量警告。此目录被 Git 忽略。

## 导出 PPTX 页面

仅在 Windows 且安装 Microsoft PowerPoint 时可用：

```powershell
powershell -File validation/render_pptx.ps1 `
  -InputPath "local-samples/linear-algebra/chapter-02-matrices.pptx" `
  -OutputPath "local-samples/linear-algebra/chapter-02-matrices.rendered.pdf"
```

导出的 PDF 只用于本地公式页面核验，不代替原始 PPTX。公式密集的 PPTX 在其他环境中应由用户先导出 PDF。

通过此验证只代表数据结构稳定，不代表真实 AI 生成质量和文档解析能力已经通过验证。
