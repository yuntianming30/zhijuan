import { chromium } from "playwright-core";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const generatedDir = resolve("local-samples/generated");
const files = (await readdir(generatedDir))
  .filter((file) => file.endsWith("-knowledge.json"))
  .sort()
  .reverse();

let graph;
for (const file of files) {
  const payload = JSON.parse(await readFile(join(generatedDir, file), "utf8"));
  if (payload.graph?.sourceCount === 5) {
    graph = payload.graph;
    break;
  }
}
if (!graph) {
  throw new Error("No generated five-source graph is available for visual QA.");
}

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
  await page.addInitScript((storedGraph) => {
    window.localStorage.setItem(
      "stem-review-workbench:last-graph",
      JSON.stringify(storedGraph),
    );
  }, graph);
  await page.goto(process.env.APP_URL ?? "http://127.0.0.1:4173/", {
    waitUntil: "networkidle",
  });
  await page.locator(".mindmap-svg text").first().waitFor();
  await page.waitForTimeout(600);

  const currentReviewCount = await page.locator(".review-item").count();
  if (currentReviewCount < 1 || currentReviewCount > 14) {
    errors.push(`generated graph rendered ${currentReviewCount} review points`);
  }
  if ((await page.locator(".mindmap-svg text").count()) < 7) {
    errors.push("generated graph rendered too few Markmap text nodes");
  }
  if ((await page.locator(".model-pill").textContent())?.includes("本地演示")) {
    errors.push("API status did not replace the local demo badge");
  }

  await page.screenshot({
    path: "screenshots/generated-graph.png",
    fullPage: true,
  });

  if (errors.length) throw new Error(errors.join(" | "));
  console.log(
    `Generated graph QA passed: ${graph.sourceCount} sources and ${currentReviewCount} visible points.`,
  );
} finally {
  await page.close();
  await browser.close();
}
