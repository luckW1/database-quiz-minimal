const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const playwrightPath = "C:/Users/31518/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const root = path.resolve(__dirname, "..");
const screenshots = path.join(root, "screenshots");
fs.mkdirSync(screenshots, { recursive: true });

let browser;

(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem("dbQuiz.prefs.v1", JSON.stringify({
      chapter: "1",
      type: "choice",
      mode: "order",
      size: "10",
    }));
  });
  await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
  await page.waitForSelector("#questionStem:not(:empty)");

  assert.match(await page.locator("#chapterTag").textContent(), /第 1 章/);
  assert.match(await page.locator("#typeTag").textContent(), /单项选择/);
  await page.locator(".option-button").nth(1).click();
  assert.equal(await page.locator("#resultTitle").textContent(), "回答正确");
  assert.equal(await page.locator("#explanation").isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(screenshots, "desktop-answer.png"), fullPage: true });

  await page.locator("#nextButton").click();
  await page.locator(".option-button").nth(0).click();
  assert.equal(await page.locator("#resultTitle").textContent(), "回答错误");

  await page.selectOption("#typeSelect", "open");
  await page.waitForSelector("#typeTag");
  assert.match(await page.locator("#typeTag").textContent(), /填空/);
  await page.getByRole("button", { name: "查看答案与解析" }).click();
  assert.equal(await page.locator("#resultTitle").textContent(), "参考答案");
  assert.equal(await page.getByRole("button", { name: "已经掌握" }).isVisible(), true);
  await page.getByRole("button", { name: "已经掌握" }).click();
  assert.equal(await page.locator("#resultTitle").textContent(), "回答正确");
  await page.screenshot({ path: path.join(screenshots, "desktop-open-answer.png"), fullPage: true });

  await page.selectOption("#typeSelect", "choice");
  for (let index = 0; index < 3; index += 1) {
    await page.locator("#nextButton").click();
  }
  assert.match(await page.locator("#typeTag").textContent(), /多项选择/);
  for (let index = 0; index < 4; index += 1) {
    await page.locator(".option-button").nth(index).click();
  }
  await page.getByRole("button", { name: "提交答案" }).click();
  assert.equal(await page.locator("#resultTitle").textContent(), "回答正确");

  await page.locator('button[data-chapter="2"]').click();
  assert.match(await page.locator("#chapterTag").textContent(), /第 2 章/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#questionStem:not(:empty)");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: path.join(screenshots, "mobile-question.png"), fullPage: true });

  await page.locator("#menuButton").click();
  assert.equal(await page.locator("#sidebar").evaluate((node) => node.classList.contains("open")), true);
  await page.locator('button[data-chapter="all"]').click();
  assert.equal(await page.locator("#sidebar").evaluate((node) => node.classList.contains("open")), false);
  assert.equal(await page.locator("#chapterLabel").textContent(), "全部章节");
  await page.waitForTimeout(240);
  await page.screenshot({ path: path.join(screenshots, "mobile-all-chapters.png"), fullPage: true });

  await page.locator("#menuButton").click();
  await page.locator('button[data-chapter="13"]').click();
  await page.waitForSelector(".empty-question");
  assert.match(await page.locator("#chapterTag").textContent(), /第 13 章/);
  assert.match(await page.locator(".empty-question").textContent(), /当前范围没有题目/);
  assert.equal(await page.locator("#nextButton").isDisabled(), true);

  assert.deepEqual(pageErrors, []);
  await browser.close();
  console.log("UI smoke test passed. Screenshots written to", screenshots);
})().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});
