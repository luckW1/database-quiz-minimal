from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source" / "question-bank.md"
EXTRA_SOURCES = [
    ROOT / "source" / "review-doc-questions.json",
    ROOT / "source" / "sql-practice-questions.json",
]
SYLLABUS_SOURCE = ROOT / "source" / "syllabus-explanations.json"
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


def normalize_stem(value: str) -> str:
    value = re.sub(r"^\s*\d+[、.．]\s*", "", value)
    value = re.sub(r"```[a-zA-Z]*", "", value)
    value = re.sub(r"[\s\u3000，。；：、,.!?！？：；（）()\[\]【】“”\"'‘’]", "", value)
    return value.lower()


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

    if len(questions) != 240:
        raise ValueError(f"Expected 240 base questions, found {len(questions)}")

    base_questions: list[dict] = []
    seen_stems: set[str] = set()
    removed_base_duplicates: list[str] = []
    for question in questions:
        normalized = normalize_stem(question["stem"])
        if normalized in seen_stems:
            removed_base_duplicates.append(question["id"])
            continue
        seen_stems.add(normalized)
        base_questions.append(question)
    questions = base_questions
    base_unique_count = len(base_questions)

    skipped_duplicates = 0
    extra_sequence = 0
    for source_path in EXTRA_SOURCES:
        source_data = json.loads(source_path.read_text(encoding="utf-8"))
        for extra in source_data["questions"]:
            extra_sequence += 1
            normalized = normalize_stem(extra["stem"])
            if normalized in seen_stems:
                skipped_duplicates += 1
                continue
            seen_stems.add(normalized)
            chapter_id = int(extra["chapter"])
            chapter = chapters[chapter_id - 1]
            question_id = f"doc-{extra_sequence:03d}"
            questions.append(
                {
                    "id": question_id,
                    "chapter": chapter_id,
                    "chapterTitle": chapter["title"],
                    "number": int(extra["number"]),
                    "title": extra["typeName"],
                    "kind": extra["kind"],
                    "answerKind": extra["kind"],
                    "typeName": extra["typeName"],
                    "stem": extra["stem"].strip(),
                    "options": extra.get("options", []),
                    "answer": extra["answer"],
                    "explanation": extra["explanation"].strip(),
                    "origin": extra.get("origin", source_data["title"]),
                }
            )

    questions.sort(
        key=lambda question: (
            question["chapter"],
            0 if not question["id"].startswith("doc-") else 1,
            question["number"],
            question["id"],
        )
    )
    for question in questions:
        question["chapterTitle"] = chapters[question["chapter"] - 1]["title"]

    syllabus = json.loads(SYLLABUS_SOURCE.read_text(encoding="utf-8"))
    rules = sorted(
        syllabus["rules"],
        key=lambda rule: int(rule.get("priority", 0)),
        reverse=True,
    )
    syllabus_matches: dict[str, int] = {}
    syllabus_updated = 0
    skip_concrete_sql_types = {
        "单表查询",
        "聚合与分组",
        "多表连接",
        "嵌套查询",
        "数据更新",
        "SQL 应用题",
        "SQL 综合题",
        "MySQL 操作题",
    }
    for question in questions:
        if question["typeName"] in skip_concrete_sql_types:
            continue
        haystacks = [
            question["stem"],
            " ".join(
                [
                    question["stem"],
                    " ".join(question.get("options", [])),
                    str(question["answer"]),
                ]
            ),
        ]
        matched_rule = None
        for haystack in haystacks:
            for rule in rules:
                if question["chapter"] not in rule["chapters"]:
                    continue
                if any(
                    re.search(
                        pattern if ".*" in pattern else re.escape(pattern),
                        haystack,
                        re.IGNORECASE,
                    )
                    for pattern in rule["patterns"]
                ):
                    matched_rule = rule
                    break
            if matched_rule:
                break
        if matched_rule:
            question["explanation"] = matched_rule["explanation"].strip()
            syllabus_matches[matched_rule["id"]] = syllabus_matches.get(matched_rule["id"], 0) + 1
            syllabus_updated += 1

    for chapter in chapters:
        chapter["count"] = 0
    for question in questions:
        chapters[question["chapter"] - 1]["count"] += 1

    ids = [question["id"] for question in questions]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate question IDs found")
    if len(chapters) != 14:
        raise ValueError(f"Expected 14 chapters, found {len(chapters)}")

    kind_counts = {
        kind: sum(1 for question in questions if question["kind"] == kind)
        for kind in ("choice", "judge", "open")
    }
    for question in questions:
        if question["kind"] == "choice":
            if len(question["options"]) < 2:
                raise ValueError(f"Choice question has too few options: {question['id']}")
            if not isinstance(question["answer"], list) or not question["answer"]:
                raise ValueError(f"Choice question has invalid answer: {question['id']}")
        elif question["kind"] == "judge":
            if question["answer"] not in {"对", "错"}:
                raise ValueError(f"Judge question has invalid answer: {question['id']}")
        else:
            if not str(question["answer"]).strip():
                raise ValueError(f"Open question has empty answer: {question['id']}")

    payload = {
        "meta": {
            "title": "数据库原理与应用",
            "subtitle": "专升本分章刷题",
            "total": len(questions),
            "baseTotal": base_unique_count,
            "baseSourceTotal": 240,
            "baseDuplicatesRemoved": len(removed_base_duplicates),
            "addedTotal": len(questions) - base_unique_count,
            "skippedDuplicates": skipped_duplicates,
            "syllabusExplanationsUpdated": syllabus_updated,
            "syllabusMatches": syllabus_matches,
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
