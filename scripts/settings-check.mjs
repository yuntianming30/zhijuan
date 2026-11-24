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
  if (name === "mobile") {
    await page.getByRole("button", { name: "打开设置" }).click();
  } else {
    await page.getByRole("button", { name: "设置", exact: true }).click();
  }
  await page.getByText("模型连接", { exact: true }).waitFor();
  await page.getByRole("button", { name: /测试连接/ }).click();
  await page.getByText(/连接成功/).waitFor({ timeout: 30_000 });

  const textModel = await page.getByLabel("文本与推理模型").inputValue();
  const visionModel = await page.getByLabel("视觉模型").inputValue();
  if (textModel !== "deepseek-v4-pro" || visionModel !== "deepseek-flash") {
    failures.push(`${name}: model presets were not loaded`);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) failures.push(`${name}: overflow is ${overflow}px`);
  if (errors.length) failures.push(`${name}: ${errors.join(" | ")}`);

  await page.screenshot({
    path: `screenshots/settings-${name}.png`,
    fullPage: true,
  });
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Settings QA passed for desktop and mobile.");
}
