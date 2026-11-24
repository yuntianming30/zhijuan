import { chromium } from "playwright-core";
import { resolve } from "node:path";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:4173/";
const imageFiles = [1, 2, 3, 4].map((page) =>
  resolve(`local-samples/linear-algebra/past-exam-2025-p${page}.jpg`),
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
  await page.getByRole("button", { name: "模拟考试", exact: true }).click();
  await page.getByText("考试蓝图", { exact: true }).first().waitFor();
  await page
    .locator('.profile-import-panel input[type="file"]')
    .setInputFiles(imageFiles);

  const modal = page.locator(".profile-modal");
  try {
    await modal.waitFor({ timeout: 320_000 });
  } catch {
    const sideError = await page.locator(".side-error").textContent();
    throw new Error(sideError || "Exam profile modal did not appear");
  }

  const profileText = (await modal.innerText()).replace(/\s+/g, " ");
  if (!profileText.includes("100")) {
    errors.push("Extracted profile does not show total score 100");
  }
  const profileSections = await modal.locator(".profile-section-item").count();
  if (profileSections < 6) {
    errors.push(`Extracted profile only has ${profileSections} sections`);
  }
  const profileQuestionCount = await modal
    .locator(".profile-section-item")
    .evaluateAll((items) =>
      items.reduce(
        (sum, item) =>
          sum + Number(item.getAttribute("data-question-count") ?? 0),
        0,
      ),
    );
  if (profileQuestionCount !== 17) {
    errors.push(`Expected 17 original questions, found ${profileQuestionCount}`);
  }
  await page.screenshot({
    path: "screenshots/exam-profile.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: /应用到考试蓝图/ }).click();
  await modal.waitFor({ state: "hidden" });
  await page.waitForTimeout(250);
  const blueprintSections = await page.locator(".section-block").count();
  if (blueprintSections !== profileSections) {
    errors.push("Applied blueprint section count does not match profile");
  }
  const scoringGroups = await page.locator(".scoring-group-row").count();
  if (scoringGroups < 2) {
    errors.push("Variable scoring groups were not preserved");
  }
  const blueprintText = (await page.locator(".blueprint-panel").innerText())
    .replace(/\s+/g, " ");
  if (!blueprintText.includes("100")) {
    errors.push("Applied blueprint does not show total score 100");
  }
  await page.screenshot({
    path: "screenshots/exam-profile-applied.png",
    fullPage: true,
  });

  if (errors.length) throw new Error(errors.join(" | "));
  console.log(
    `Exam profile passed: ${profileSections} sections and ${scoringGroups} scoring groups.`,
  );
} finally {
  await page.close();
  await browser.close();
}
