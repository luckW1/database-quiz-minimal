from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "output" / "docs" / "数据库原理与应用_专升本_分章模拟题库与详解.md"
OUTPUT = ROOT / "data.js"

CHAPTER_RE = re.compile(r"^# (第([一二三四五六七八九十]+)章)\s+(.+)$")
QUESTION_RE = re.compile(r"^### (\d+)-(\d+)\s+(.+)$")
OPTION_RE = re.compile(r"^([A-F])\.\s*(.+)$")


def clean_lines(lines: list[str]) -> str:
    while lines and (not lines[0].strip() or lines[0].strip() == "---"):
        lines.pop(0)
    while lines and (not lines[-1].strip() or lines[-1].strip() == "---"):
        lines.pop()
    return "\n".join(line.rstrip() for line in lines).strip()


def parse_answer(kind: str, title: str, raw: str) -> tuple[str | list[str], str]:
    text = raw.strip()
    if kind == "choice":
        letters = sorted(set(re.findall(r"[A-F]", text)))
        if not letters:
            raise ValueError(f"Choice answer has no option letters: {title} -> {text}")
        return letters, "choice"
    if kind == "judge":
        if "错误" in text:
            return "错", "judge"
        if "正确" in text:
            return "对", "judge"
        raise ValueError(f"Judge answer is not recognized: {title} -> {text}")
    return text, "open"


def parse_question(chapter_id: int, chapter_title: str, raw_number: str, title: str, lines: list[str]) -> dict:
    answer_at = next((i for i, line in enumerate(lines) if line.startswith("**答案：**")), None)
    if answer_at is None:
        raise ValueError(f"Missing answer: {chapter_id}-{raw_number}")

    explain_at = next(
        (i for i, line in enumerate(lines[answer_at + 1 :], start=answer_at + 1) if line.startswith("**解析：**")),
        None,
    )
    if explain_at is None:
        raise ValueError(f"Missing explanation: {chapter_id}-{raw_number}")

    body = lines[:answer_at]
    answer_raw = "\n".join(
        [lines[answer_at].replace("**答案：**", "", 1)] + lines[answer_at + 1 : explain_at]
    )
    explanation = "\n".join(
        [lines[explain_at].replace("**解析：**", "", 1)] + lines[explain_at + 1 :]
    )

    if "单项选择题" in title:
        kind = "choice"
        type_name = "单项选择"
    elif "多项选择题" in title:
        kind = "choice"
        type_name = "多项选择"
    elif "判断题" in title:
        kind = "judge"
        type_name = "判断"
    elif "填空题" in title:
        kind = "open"
        type_name = "填空"
    elif "简答题" in title:
        kind = "open"
        type_name = "简答"
    else:
        kind = "open"
        type_name = "综合题"

    options: list[str] = []
    stem_lines = body
    first_option = next((i for i, line in enumerate(body) if OPTION_RE.match(line)), None)
    if kind == "choice":
        if first_option is None:
            raise ValueError(f"Choice question has no options: {chapter_id}-{raw_number}")
        stem_lines = body[:first_option]
        for line in body[first_option:]:
            match = OPTION_RE.match(line)
            if match:
                options.append(match.group(2).strip())
            elif line.strip():
                if options:
                    options[-1] += "\n" + line.strip()
    elif first_option is not None:
        # A few open questions contain SQL aliases such as A.xxx; do not treat them as options.
        stem_lines = body

    stem = clean_lines(list(stem_lines))
    answer, answer_kind = parse_answer(kind, f"{chapter_id}-{raw_number}", answer_raw)

    if kind == "choice":
        if len(options) < 2:
            raise ValueError(f"Too few options: {chapter_id}-{raw_number}")
        for letter in answer:
            if ord(letter) - ord("A") >= len(options):
                raise ValueError(f"Answer letter outside options: {chapter_id}-{raw_number} {answer}")

    return {
        "id": f"{chapter_id}-{raw_number}",
        "chapter": chapter_id,
        "chapterTitle": chapter_title,
        "number": int(raw_number),
        "title": title,
        "kind": kind,
        "answerKind": answer_kind,
        "typeName": type_name,
        "stem": stem,
        "options": options,
        "answer": answer,
        "explanation": clean_lines(explanation.splitlines()),
    }


def build() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    lines = text.splitlines()
    chapters: list[dict] = []
    questions: list[dict] = []
    chapter: dict | None = None
    current_question: tuple[str, str, list[str]] | None = None

    def finish_question() -> None:
        nonlocal current_question
        if current_question is None or chapter is None:
            return
        raw_number, title, block = current_question
        questions.append(parse_question(chapter["id"], chapter["title"], raw_number, title, block))
        current_question = None

    for line in lines:
        chapter_match = CHAPTER_RE.match(line)
        if chapter_match:
            finish_question()
            numeral, short_title = chapter_match.group(2), chapter_match.group(3).strip()
            chapter = {
                "id": len(chapters) + 1,
                "title": f"{chapter_match.group(1)} {short_title}",
                "shortTitle": short_title,
                "count": 0,
            }
            chapters.append(chapter)
            continue

        question_match = QUESTION_RE.match(line)
        if question_match and chapter is not None:
            finish_question()
            current_question = (question_match.group(2), question_match.group(3).strip(), [])
            continue

        if current_question is not None:
            current_question[2].append(line)

    finish_question()

    for question in questions:
        chapters[question["chapter"] - 1]["count"] += 1

    ids = [question["id"] for question in questions]
    if len(questions) != 240:
        raise ValueError(f"Expected 240 questions, found {len(questions)}")
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate question IDs found")
    if len(chapters) != 14:
        raise ValueError(f"Expected 14 chapters, found {len(chapters)}")

    kind_counts = {
        kind: sum(1 for question in questions if question["kind"] == kind)
        for kind in ("choice", "judge", "open")
    }
    if kind_counts != {"choice": 62, "judge": 35, "open": 143}:
        raise ValueError(f"Unexpected kind counts: {kind_counts}")

    payload = {
        "meta": {
            "title": "数据库原理与应用",
            "subtitle": "专升本分章刷题",
            "total": len(questions),
            "chapterCount": len(chapters),
            "kindCounts": kind_counts,
        },
        "chapters": chapters,
        "questions": questions,
    }
    OUTPUT.write_text(
        "window.DB_QUIZ = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {OUTPUT} with {payload['meta']['total']} questions, "
        f"{payload['meta']['chapterCount']} chapters, kinds={kind_counts}"
    )


if __name__ == "__main__":
    build()
