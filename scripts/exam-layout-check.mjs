import { chromium } from "playwright-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4173/";
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
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "模拟考试", exact: true }).click();
  await page.getByText("考试蓝图", { exact: true }).first().waitFor();
  await page.waitForTimeout(250);

  const activeNav = await page.locator(".nav-item.is-active").allTextContents();
  if (activeNav.length !== 1 || activeNav[0].trim() !== "模拟考试") {
    failures.push(`${name}: active nav is ${JSON.stringify(activeNav)}`);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) failures.push(`${name}: horizontal overflow is ${overflow}px`);
  if (errors.length) failures.push(`${name}: ${errors.join(" | ")}`);

  await page.screenshot({
    path: `screenshots/exam-${name}-layout.png`,
    fullPage: true,
  });
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Exam layout QA passed for desktop and mobile.");
}
