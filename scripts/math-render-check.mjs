import { chromium } from "playwright-core";

const paper = {
  id: "paper-math-check",
  title: "线性代数公式渲染检查",
  course: "面向对象程序设计",
  durationMinutes: 10,
  totalScore: 10,
  warnings: [],
  generatedAt: new Date().toISOString(),
  model: "DeepSeek V4",
  sections: [
    {
      id: "math-section",
      title: "计算题",
      questionType: "calculation",
      questionCount: 1,
      pointsPerQuestion: 10,
      sectionScore: 10,
    },
  ],
  questions: [
    {
      id: "math-question",
      sectionId: "math-section",
      questionType: "calculation",
      points: 10,
      knowledgeNodeIds: ["constructor"],
      stemMarkdown:
        "已知矩阵 $A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$，求 $\\det(A)$。\n\n$$\\det(A)=1\\times4-2\\times3=-2$$",
      options: [],
      answer: "-2",
      explanationMarkdown: "使用二阶行列式公式计算。",
      rubric: ["写出行列式公式", "计算得到 -2"],
      gradingMode: "rubricSelf",
    },
  ],
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1200, height: 900 },
  locale: "zh-CN",
  colorScheme: "light",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.addInitScript((storedPaper) => {
    window.localStorage.setItem(
      "stem-review-workbench:last-paper",
      JSON.stringify(storedPaper),
    );
  }, paper);
  await page.goto(process.env.APP_URL ?? "http://127.0.0.1:4173/", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "模拟考试", exact: true }).click();
  await page.locator(".paper-question").first().waitFor();
  const katexCount = await page.locator(".paper-question .katex").count();
  if (katexCount < 2) {
    errors.push(`Expected rendered KaTeX formulas, found ${katexCount}`);
  }
  if (errors.length) throw new Error(errors.join(" | "));
  await page.screenshot({
    path: "screenshots/math-render.png",
    fullPage: true,
  });
  console.log(`Math rendering passed with ${katexCount} KaTeX nodes.`);
} finally {
  await page.close();
  await browser.close();
}
