import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), sandbox);
const data = sandbox.window.DB_QUIZ;

assert.equal(data.chapters.length, 14);
assert.equal(data.questions.length, 240);
assert.equal(data.meta.kindCounts.choice, 62);
assert.equal(data.meta.kindCounts.judge, 35);
assert.equal(data.meta.kindCounts.open, 143);

const ids = new Set();
for (const question of data.questions) {
  assert.ok(!ids.has(question.id), `duplicate id: ${question.id}`);
  ids.add(question.id);
  assert.ok(question.stem.trim(), `missing stem: ${question.id}`);
  assert.ok(question.explanation.trim(), `missing explanation: ${question.id}`);
  assert.ok(question.answer, `missing answer: ${question.id}`);
  if (question.kind === "choice") {
    assert.ok(question.options.length >= 2, `missing options: ${question.id}`);
    assert.ok(question.answer.every((letter) => "ABCDEF".includes(letter)));
  }
  if (question.kind === "judge") {
    assert.ok(question.answer === "对" || question.answer === "错");
  }
}

for (const chapter of data.chapters) {
  assert.equal(
    data.questions.filter((question) => question.chapter === chapter.id).length,
    chapter.count,
    `chapter count mismatch: ${chapter.id}`,
  );
}

console.log("Data validation passed: 240 questions across 14 chapters.");
