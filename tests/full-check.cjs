const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const playwrightPath = "C:/Users/31518/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(playwrightPath);

const root = path.resolve(__dirname, "..");
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), sandbox);
const data = sandbox.window.DB_QUIZ;
const appOrder = (items) => items.slice().sort((left, right) => left.chapter - right.chapter || left.number - right.number);

let browser;

async function openMode(type, questions) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((selectedType) => {
    localStorage.setItem("dbQuiz.prefs.v1", JSON.stringify({
      chapter: "all",
      type: selectedType,
      mode: "order",
      size: "all",
    }));
  }, type);
  await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
  await page.waitForSelector("#questionStem:not(:empty)");
  return { page, errors, questions };
}

async function finishQuestion(page, index, total) {
  await page.locator("#nextButton").click();
  if (index === total - 1) {
    await page.waitForSelector("#summaryView:not([hidden])");
  }
}

(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(edgePath) ? { executablePath: edgePath } : {}),
  });

  const choiceQuestions = appOrder(data.questions.filter((question) => question.kind === "choice"));
  const choiceRun = await openMode("choice", choiceQuestions);
  for (let index = 0; index < choiceQuestions.length; index += 1) {
    const question = choiceQuestions[index];
    for (const letter of question.answer) {
      await choiceRun.page.locator(`.option-button[data-value="${letter}"]`).click();
    }
    if (question.answer.length > 1) {
      await choiceRun.page.getByRole("button", { name: "提交答案" }).click();
    }
    assert.equal(
      await choiceRun.page.locator("#resultTitle").textContent(),
      "回答正确",
      `choice question failed: ${question.id}`,
    );
    await finishQuestion(choiceRun.page, index, choiceQuestions.length);
  }
  assert.deepEqual(choiceRun.errors, []);
  await choiceRun.page.close();

  const judgeQuestions = appOrder(data.questions.filter((question) => question.kind === "judge"));
  const judgeRun = await openMode("judge", judgeQuestions);
  for (let index = 0; index < judgeQuestions.length; index += 1) {
    const question = judgeQuestions[index];
    await judgeRun.page.locator(`.option-button[data-value="${question.answer}"]`).click();
    assert.equal(
      await judgeRun.page.locator("#resultTitle").textContent(),
      "回答正确",
      `judge question failed: ${question.id}`,
    );
    await finishQuestion(judgeRun.page, index, judgeQuestions.length);
  }
  assert.deepEqual(judgeRun.errors, []);
  await judgeRun.page.close();

  const openQuestions = appOrder(data.questions.filter((question) => question.kind === "open"));
  const openRun = await openMode("open", openQuestions);
  for (let index = 0; index < openQuestions.length; index += 1) {
    const question = openQuestions[index];
    await openRun.page.getByRole("button", { name: "查看答案与解析" }).click();
    assert.equal(
      await openRun.page.locator("#explanation").isVisible(),
      true,
      `open explanation failed: ${question.id}`,
    );
    await finishQuestion(openRun.page, index, openQuestions.length);
  }
  assert.deepEqual(openRun.errors, []);
  await openRun.page.close();

  await browser.close();
  console.log(`Full interaction check passed: ${choiceQuestions.length} choice, ${judgeQuestions.length} judge, ${openQuestions.length} open.`);
})().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});
