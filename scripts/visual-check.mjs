import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4173/";
const screenshotDir = "screenshots";

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const failures = [];

async function inspectPage(name, viewportSize) {
  const page = await browser.newPage({
    viewport: viewportSize,
    locale: "zh-CN",
    colorScheme: "light",
  });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".mindmap-svg text").first().waitFor();
  await page.waitForTimeout(700);

  const reviewCount = await page.locator(".review-item").count();
  const mapNodeCount = await page.locator(".mindmap-svg text").count();
  if (reviewCount !== 9) {
    failures.push(`${name}: expected 9 focused points, found ${reviewCount}`);
  }
  if (mapNodeCount < 7) {
    failures.push(`${name}: mind map rendered too few nodes (${mapNodeCount})`);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) {
    failures.push(`${name}: horizontal overflow is ${overflow}px`);
  }

  if (name === "desktop") {
    await page.getByRole("button", { name: /15 分钟/ }).click();
    await page.waitForTimeout(400);
    const quickCount = await page.locator(".review-item").count();
    if (quickCount !== 5) {
      failures.push(`desktop: expected 5 quick points, found ${quickCount}`);
    }

    await page.getByRole("button", { name: /完整梳理/ }).click();
    await page.waitForTimeout(400);
    const completeCount = await page.locator(".review-item").count();
    if (completeCount !== 10) {
      failures.push(
        `desktop: expected 10 complete points, found ${completeCount}`,
      );
    }

    await page.getByRole("button", { name: /CDC 与 GDI 绘图对象/ }).click();
    const selectedTitle = await page.locator(".node-detail h3").textContent();
    if (selectedTitle?.trim() !== "CDC 与 GDI 绘图对象") {
      failures.push(`desktop: detail selection did not update`);
    }

    await page.locator(".source-link").first().click();
    if (!(await page.locator(".source-modal").isVisible())) {
      failures.push(`desktop: source detail did not open`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    if (await page.locator(".source-modal").isVisible()) {
      failures.push(`desktop: source detail did not close with Escape`);
    }
  }

  await page.screenshot({
    path: `${screenshotDir}/qa-${name}.png`,
    fullPage: true,
  });

  if (runtimeErrors.length) {
    failures.push(`${name}: browser errors: ${runtimeErrors.join(" | ")}`);
  }

  await page.close();
}

try {
  await inspectPage("desktop", { width: 1440, height: 1000 });
  await inspectPage("mobile", { width: 390, height: 844 });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("Visual QA failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Visual QA passed: desktop and mobile layouts are valid.");
}
