import { chromium } from "playwright-core";
import { resolve } from "node:path";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4173/";
const samplePdf = resolve(
  "local-samples/oop/03-message-response-review.pdf",
);
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

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("DeepSeek V4", { exact: true }).first().waitFor();
  await page.locator('input[type="file"]').setInputFiles(samplePdf);
  await page
    .getByText(/已根据 1 份资料重新整理知识导图/)
    .waitFor({ timeout: 300_000 });

  const reviewCount = await page.locator(".review-item").count();
  if (reviewCount < 1 || reviewCount > 14) {
    errors.push(`upload generation returned ${reviewCount} visible points`);
  }
  const facts = (await page.locator(".course-facts").textContent()) ?? "";
  if (!facts.replace(/\s+/g, "").includes("1份课程资料")) {
    errors.push("upload generation did not update the source count");
  }

  await page.screenshot({
    path: "screenshots/upload-generation.png",
    fullPage: true,
  });

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }
  console.log(`Upload path passed: ${reviewCount} visible review points.`);
} finally {
  await page.close();
  await browser.close();
}
