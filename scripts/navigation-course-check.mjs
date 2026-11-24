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

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    for (const label of [
      "课程资料",
      "历史记录",
      "错题本",
      "收藏",
      "复习导图",
      "模拟考试",
    ]) {
      const button = page.getByRole("button", { name: label, exact: true });
      if (!(await button.isEnabled())) {
        failures.push(`${name}: navigation item ${label} is disabled`);
      }
      await button.click();
      await page.waitForTimeout(120);
      const active = await page.locator(".nav-item.is-active").allTextContents();
      if (active.length !== 1 || active[0].trim() !== label) {
        failures.push(
          `${name}: active navigation after ${label} is ${JSON.stringify(active)}`,
        );
      }
    }

    await page.getByRole("button", { name: "课程资料", exact: true }).click();
    await page
      .getByRole("button", { name: "新建课程", exact: true })
      .last()
      .click();
    await page.getByLabel("课程名称").fill("数字电路");
    await page.getByLabel("课程说明").fill("组合逻辑与时序逻辑");
    await page.getByLabel("语言（可选）").fill("Verilog");
    await page.getByRole("button", { name: "创建并进入课程" }).click();
    await page.getByRole("heading", { name: "数字电路", exact: true }).waitFor();

    const selectValue = await page.locator(".course-select").inputValue();
    if (!selectValue.startsWith("course-")) {
      failures.push(`${name}: custom course was not selected`);
    }
    const customCourseVisible = await page
      .locator(".course-chip")
      .filter({ hasText: "数字电路" })
      .count();
    if (!customCourseVisible) {
      failures.push(`${name}: custom course is missing from course list`);
    }

    await page.reload({ waitUntil: "networkidle" });
    const persistedValue = await page.locator(".course-select").inputValue();
    if (persistedValue !== selectValue) {
      failures.push(`${name}: custom course did not persist after reload`);
    }
    await page.getByRole("button", { name: "课程资料", exact: true }).click();
    await page.getByRole("heading", { name: "数字电路", exact: true }).waitFor();

    if (name === "mobile") {
      await page.getByRole("button", { name: "打开设置", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "设置", exact: true }).click();
    }
    await page.getByText("第一次使用 DeepSeek？", { exact: true }).waitFor();
    await page.getByText("按需充值", { exact: true }).waitFor();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    if (overflow > 1) {
      failures.push(`${name}: horizontal overflow is ${overflow}px`);
    }

    await page.screenshot({
      path: `screenshots/navigation-course-${name}.png`,
      fullPage: true,
    });
  } finally {
    if (errors.length) failures.push(`${name}: ${errors.join(" | ")}`);
    await page.close();
  }
}

await browser.close();

if (failures.length) {
  console.error("Navigation and course QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    "Navigation and course QA passed: all views are selectable and custom courses can be created.",
  );
}
