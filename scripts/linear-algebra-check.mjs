import { chromium } from "playwright-core";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4173/";
const imageFiles = [1, 2, 3, 4].map((page) =>
  resolve(`local-samples/linear-algebra/past-exam-2025-p${page}.jpg`),
);
const generatedDir = resolve("local-samples/generated");
const generatedFiles = (await readdir(generatedDir)).sort().reverse();
let graph = null;
for (const file of generatedFiles.filter((name) =>
  name.endsWith("-knowledge.json"),
)) {
  const payload = JSON.parse(await readFile(resolve(generatedDir, file), "utf8"));
  if (payload.graph?.course === "线性代数") {
    graph = payload.graph;
    break;
  }
}
if (!graph) throw new Error("No linear algebra graph is available.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "zh-CN",
  colorScheme: "light",
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("dialog", (dialog) => dialog.accept());

try {
  await page.addInitScript((storedGraph) => {
    window.localStorage.setItem(
      "stem-review-workbench:last-graph:linear-algebra",
      JSON.stringify(storedGraph),
    );
  }, graph);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page
    .locator(".course-chip")
    .filter({ hasText: "线性代数" })
    .click();
  await page.waitForTimeout(300);

  const breadcrumb = (await page.locator(".breadcrumbs").innerText()).replace(
    /\s+/g,
    " ",
  );
  if (!breadcrumb.includes("线性代数")) {
    errors.push(`Course switch failed: ${breadcrumb}`);
  }
  await page.screenshot({
    path: "screenshots/linear-algebra-graph.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "模拟考试", exact: true }).click();
  await page.getByText("考试蓝图", { exact: true }).first().waitFor();
  await page
    .locator('.profile-import-panel input[type="file"]')
    .setInputFiles(imageFiles);
  const profileModal = page.locator(".profile-modal");
  try {
    await profileModal.waitFor({ timeout: 320_000 });
  } catch {
    const sideError = await page.locator(".side-error").textContent();
    throw new Error(sideError || "Linear algebra profile modal did not appear");
  }
  await page.getByRole("button", { name: /应用到考试蓝图/ }).click();
  await profileModal.waitFor({ state: "hidden" });

  const blueprintText = (await page.locator(".blueprint-panel").innerText())
    .replace(/\s+/g, " ");
  if (!blueprintText.includes("100 分")) {
    errors.push("Linear algebra blueprint does not total 100 points");
  }
  await page.getByRole("button", { name: /生成模拟试卷/ }).click();
  await page
    .getByRole("button", { name: /开始答题/ })
    .first()
    .waitFor({ timeout: 480_000 });

  const questionCount = await page.locator(".paper-question").count();
  const katexCount = await page.locator(".paper-question .katex").count();
  if (questionCount < 15) {
    errors.push(`Linear algebra paper only has ${questionCount} questions`);
  }
  if (katexCount < 1) {
    errors.push("Linear algebra paper contains no rendered formulas");
  }
  await page.screenshot({
    path: "screenshots/linear-algebra-exam.png",
    fullPage: true,
  });
  if (errors.length) throw new Error(errors.join(" | "));
  console.log(
    `Linear algebra pilot passed: ${questionCount} questions, ${katexCount} rendered formulas.`,
  );
} finally {
  await page.close();
  await browser.close();
}
