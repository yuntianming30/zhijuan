import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4173/";
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
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "模拟考试", exact: true }).click();
  await page.getByText("考试蓝图", { exact: true }).first().waitFor();
  await page.screenshot({
    path: "screenshots/exam-blueprint.png",
    fullPage: true,
  });

  const generateButton = page.getByRole("button", { name: /生成模拟试卷/ });
  if (!(await generateButton.isEnabled())) {
    throw new Error("Default exam blueprint is not valid.");
  }
  await generateButton.click();
  await page
    .getByRole("button", { name: /开始答题/ })
    .first()
    .waitFor({ timeout: 480_000 });

  const questionCount = await page.locator(".paper-question").count();
  if (questionCount < 1) {
    throw new Error("Generated paper does not contain questions.");
  }
  await page.screenshot({
    path: "screenshots/exam-preview.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: /开始答题/ }).first().click();
  await page.getByText("答题进度", { exact: true }).waitFor();
  await page.locator(".answer-option").first().click();
  await page.getByRole("button", { name: /^交卷$/ }).click();
  await page.getByText("模拟考试复盘", { exact: true }).waitFor();

  if ((await page.locator(".result-question").count()) !== questionCount) {
    throw new Error("Result page question count does not match the paper.");
  }
  await page.screenshot({
    path: "screenshots/exam-result.png",
    fullPage: true,
  });

  if (errors.length) throw new Error(errors.join(" | "));
  console.log(
    `Exam flow passed: blueprint, ${questionCount}-question preview, attempt and result.`,
  );
} finally {
  await page.close();
  await browser.close();
}
