import { chromium } from "playwright-core";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const generatedDir = resolve("local-samples/generated");
const examFiles = (await readdir(generatedDir))
  .filter((file) => file.endsWith("-exam.json"))
  .sort()
  .reverse();
if (!examFiles.length) {
  throw new Error("No generated exam is available for responsive QA.");
}
const payload = JSON.parse(
  await readFile(join(generatedDir, examFiles[0]), "utf8"),
);
const paper = payload.paper;
if (!paper?.questions?.length) {
  throw new Error("Latest generated exam is missing paper data.");
}
const knowledgeFiles = (await readdir(generatedDir))
  .filter((file) => file.endsWith("-knowledge.json"))
  .sort()
  .reverse();
let graph = null;
for (const file of knowledgeFiles) {
  const candidate = JSON.parse(
    await readFile(join(generatedDir, file), "utf8"),
  );
  if (candidate.graph?.course === paper.course) {
    graph = candidate.graph;
    break;
  }
}
if (!graph) {
  throw new Error(`No knowledge graph matches ${paper.course}.`);
}
const courseKey =
  paper.course === "线性代数"
    ? "linear-algebra"
    : paper.course === "面向对象程序设计"
      ? "oop"
      : "physics";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const failures = [];

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({
    viewport,
    locale: "zh-CN",
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.addInitScript(({ storedPaper, storedGraph, storedCourseKey }) => {
    window.localStorage.setItem(
      "stem-review-workbench:last-paper",
      JSON.stringify(storedPaper),
    );
    window.localStorage.setItem(
      `stem-review-workbench:last-graph:${storedCourseKey}`,
      JSON.stringify(storedGraph),
    );
  }, { storedPaper: paper, storedGraph: graph, storedCourseKey: courseKey });
  await page.goto(process.env.APP_URL ?? "http://127.0.0.1:4173/", {
    waitUntil: "networkidle",
  });
  if (courseKey !== "oop") {
    if (name === "mobile") {
      await page.selectOption(".course-select", courseKey);
    } else {
      await page
        .locator(".course-chip")
        .filter({ hasText: paper.course })
        .click();
    }
  }
  await page.getByRole("button", { name: "模拟考试", exact: true }).click();
  await page.locator(".paper-question").first().waitFor();
  const katexCount = await page.locator(".paper-question .katex").count();
  if (paper.course === "线性代数" && katexCount < 1) {
    failures.push(`${name}: linear algebra paper has no rendered formulas`);
  }

  const previewOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (previewOverflow > 1) {
    failures.push(`${name}: preview overflow is ${previewOverflow}px`);
  }
  await page.screenshot({
    path: `screenshots/exam-${name}-preview.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `screenshots/exam-${name}-preview-top.png`,
  });

  await page.getByRole("button", { name: /开始答题/ }).first().click();
  await page.getByText("答题进度", { exact: true }).waitFor();
  await page.locator(".answer-option").first().click();
  const attemptOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (attemptOverflow > 1) {
    failures.push(`${name}: attempt overflow is ${attemptOverflow}px`);
  }
  await page.screenshot({
    path: `screenshots/exam-${name}-attempt.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: /^交卷$/ }).click();
  await page.getByText("模拟考试复盘", { exact: true }).waitFor();
  const resultOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (resultOverflow > 1) {
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className:
              typeof element.className === "string"
                ? element.className
                : "",
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((item) => item.right > window.innerWidth + 1)
        .slice(0, 8),
    );
    failures.push(
      `${name}: result overflow is ${resultOverflow}px ${JSON.stringify(offenders)}`,
    );
  }
  if (errors.length) failures.push(`${name}: ${errors.join(" | ")}`);
  await page.screenshot({
    path: `screenshots/exam-${name}-result.png`,
    fullPage: true,
  });
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Exam responsive QA passed for ${paper.questions.length}-question paper.`,
  );
}
