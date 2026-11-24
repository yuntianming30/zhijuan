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

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".mindmap-svg text").first().waitFor();
  await page.getByText("DeepSeek V4", { exact: true }).first().waitFor();

  await page.getByRole("button", { name: /按当前范围重新梳理/ }).click();
  await page
    .getByText(/已根据 \d+ 份资料重新整理知识导图/)
    .waitFor({ timeout: 300_000 });

  const reviewCount = await page.locator(".review-item").count();
  if (reviewCount < 1 || reviewCount > 14) {
    errors.push(`live generation returned ${reviewCount} visible points`);
  }

  const sourceLabel = await page.locator(".source-link").first().textContent();
  if (!sourceLabel?.includes("第")) {
    errors.push("live generation did not expose source pages");
  }

  await page.screenshot({
    path: "screenshots/live-generation.png",
    fullPage: true,
  });

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }
  console.log(
    `Live generation passed: ${reviewCount} visible review points rendered.`,
  );
} finally {
  await page.close();
  await browser.close();
}
