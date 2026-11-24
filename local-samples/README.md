# 本地测试资料

此目录用于放置脱敏后的真实课程资料，目录内容默认被 Git 忽略。

建议结构：

```text
local-samples/
  linear-algebra/
    slides.pdf
    exam-paper.png
    expected-notes.md
  university-physics/
    slides.pptx
    exam-paper.jpg
    expected-notes.md
  oop/
    slides.pdf
    exam-paper.png
    expected-notes.md
```

每门课至少准备：

1. 一份包含课程核心内容的课件，优先 PDF 或 PPTX。
2. 一张历年真题、习题或考试范围图片。
3. 一份 `expected-notes.md`，列出 3 到 5 个必须识别出的知识点。

注意：

- 删除姓名、学号、班级和教师私人信息。
- 不要放入模型 API Key。
- 不要把未经授权的教材或真题上传到公开仓库。
- 样例只用于本地解析与生成质量验证。
