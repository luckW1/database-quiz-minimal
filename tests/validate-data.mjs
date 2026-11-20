import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), sandbox);
const data = sandbox.window.DB_QUIZ;

assert.equal(data.chapters.length, 14);
assert.equal(data.meta.total, 589);
assert.equal(data.meta.baseTotal, 238);
assert.equal(data.meta.baseSourceTotal, 240);
assert.equal(data.meta.baseDuplicatesRemoved, 2);
assert.equal(data.meta.addedTotal, 351);
assert.equal(data.meta.kindCounts.choice, 193);
assert.equal(data.meta.kindCounts.judge, 115);
assert.equal(data.meta.kindCounts.open, 281);
assert.equal(data.meta.syllabusExplanationsUpdated, 455);

const ids = new Set();
const stems = new Set();
const normalize = (value) => value
  .replace(/^\s*\d+[、.．]\s*/, "")
  .replace(/```[a-zA-Z]*/g, "")
  .replace(/[\s\u3000，。；：、,.!?！？：；（）()\[\]【】“”"'‘’]/g, "")
  .toLowerCase();
for (const question of data.questions) {
  assert.ok(!ids.has(question.id), `duplicate id: ${question.id}`);
  ids.add(question.id);
  const normalized = normalize(question.stem);
  assert.ok(normalized, `empty normalized stem: ${question.id}`);
  assert.ok(!stems.has(normalized), `duplicate stem: ${question.id}`);
  stems.add(normalized);
  assert.ok(question.stem.trim(), `missing stem: ${question.id}`);
  assert.ok(question.explanation.trim(), `missing explanation: ${question.id}`);
  assert.ok(question.explanation.length >= 20, `explanation too short: ${question.id}`);
  assert.ok(question.answer, `missing answer: ${question.id}`);
  for (const field of ["stem", "answer", "explanation"]) {
    const value = String(question[field] || "");
    const fences = (value.match(/```/g) || []).length;
    assert.equal(fences % 2, 0, `unbalanced code fence in ${question.id}.${field}`);
  }
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

console.log("Data validation passed: 589 unique questions across 14 chapters.");
