(function () {
  "use strict";

  const data = window.DB_QUIZ;
  if (!data || !Array.isArray(data.questions)) return;

  const PREF_KEY = "dbQuiz.prefs.v1";
  const RECORD_KEY = "dbQuiz.records.v1";
  const LETTERS = "ABCDEF";
  const questions = data.questions;
  const chapters = data.chapters;
  const byId = new Map(questions.map((question) => [question.id, question]));

  const defaultPrefs = {
    chapter: "all",
    type: "all",
    mode: "random",
    size: "20",
  };

  let prefs = readJSON(PREF_KEY, defaultPrefs);
  prefs = {
    chapter: prefs.chapter === "all" || chapters.some((chapter) => String(chapter.id) === String(prefs.chapter))
      ? String(prefs.chapter)
      : "all",
    type: ["all", "objective", "choice", "judge", "open"].includes(prefs.type) ? prefs.type : "all",
    mode: prefs.mode === "order" ? "order" : "random",
    size: ["10", "20", "40", "all"].includes(String(prefs.size)) ? String(prefs.size) : "20",
  };

  let records = normalizeRecords(readJSON(RECORD_KEY, {}));
  const state = {
    session: null,
    selected: [],
    completed: false,
  };

  const elements = {
    menuButton: document.getElementById("menuButton"),
    closeButton: document.getElementById("closeButton"),
    sidebar: document.getElementById("sidebar"),
    scrim: document.getElementById("scrim"),
    chapterList: document.getElementById("chapterList"),
    typeSelect: document.getElementById("typeSelect"),
    modeGroup: document.getElementById("modeGroup"),
    sizeSelect: document.getElementById("sizeSelect"),
    startButton: document.getElementById("startButton"),
    resetButton: document.getElementById("resetButton"),
    practiceView: document.getElementById("practiceView"),
    summaryView: document.getElementById("summaryView"),
    chapterLabel: document.getElementById("chapterLabel"),
    sessionSummary: document.getElementById("sessionSummary"),
    progressBar: document.getElementById("progressBar"),
    chapterTag: document.getElementById("chapterTag"),
    typeTag: document.getElementById("typeTag"),
    questionNumber: document.getElementById("questionNumber"),
    questionStem: document.getElementById("questionStem"),
    answerZone: document.getElementById("answerZone"),
    explanation: document.getElementById("explanation"),
    resultTitle: document.getElementById("resultTitle"),
    resultMark: document.getElementById("resultMark"),
    referenceAnswer: document.getElementById("referenceAnswer"),
    explanationText: document.getElementById("explanationText"),
    postAnswerActions: document.getElementById("postAnswerActions"),
    prevButton: document.getElementById("prevButton"),
    nextButton: document.getElementById("nextButton"),
    correctCount: document.getElementById("correctCount"),
    wrongCount: document.getElementById("wrongCount"),
    headerSeen: document.getElementById("headerSeen"),
    headerAccuracy: document.getElementById("headerAccuracy"),
    sidebarSeen: document.getElementById("sidebarSeen"),
    sidebarWrong: document.getElementById("sidebarWrong"),
    summaryTitle: document.getElementById("summaryTitle"),
    summaryCopy: document.getElementById("summaryCopy"),
    summaryDone: document.getElementById("summaryDone"),
    summaryCorrect: document.getElementById("summaryCorrect"),
    summaryWrong: document.getElementById("summaryWrong"),
    summaryRate: document.getElementById("summaryRate"),
    againButton: document.getElementById("againButton"),
    retryWrongButton: document.getElementById("retryWrongButton"),
  };

  function readJSON(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Practice still works when storage is unavailable.
    }
  }

  function normalizeRecords(value) {
    const clean = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return clean;
    for (const question of questions) {
      const item = value[question.id];
      if (!item || typeof item !== "object") continue;
      clean[question.id] = {
        attempts: Number.isFinite(item.attempts) ? Math.max(0, item.attempts) : 0,
        correct: Number.isFinite(item.correct) ? Math.max(0, item.correct) : 0,
        lastCorrect: typeof item.lastCorrect === "boolean" ? item.lastCorrect : null,
        updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
      };
    }
    return clean;
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function inlineToHTML(value) {
    const parts = String(value).split(/(`[^`]+`)/g);
    return parts.map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return `<code>${escapeHTML(part.slice(1, -1))}</code>`;
      }
      return escapeHTML(part).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }).join("");
  }

  function markdownToHTML(value) {
    const source = String(value || "");
    const codePattern = /```[^\n]*\n?([\s\S]*?)```/g;
    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = codePattern.exec(source)) !== null) {
      result += textToHTML(source.slice(lastIndex, match.index));
      result += `<pre><code>${escapeHTML(match[1].replace(/\n$/, ""))}</code></pre>`;
      lastIndex = match.index + match[0].length;
    }
    result += textToHTML(source.slice(lastIndex));
    return result;
  }

  function textToHTML(value) {
    const text = String(value).trim();
    if (!text) return "";
    return text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${inlineToHTML(paragraph).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[next]] = [copy[next], copy[index]];
    }
    return copy;
  }

  function chapterById(id) {
    return chapters.find((chapter) => chapter.id === Number(id)) || null;
  }

  function activeChapterLabel() {
    if (prefs.chapter === "all") return "全部章节";
    const chapter = chapterById(prefs.chapter);
    return chapter ? `第 ${chapter.id} 章` : "全部章节";
  }

  function filteredQuestions() {
    return questions.filter((question) => {
      if (prefs.chapter !== "all" && question.chapter !== Number(prefs.chapter)) return false;
      if (prefs.type === "objective" && question.kind === "open") return false;
      if (["choice", "judge", "open"].includes(prefs.type) && question.kind !== prefs.type) return false;
      return true;
    });
  }

  function savePrefs() {
    saveJSON(PREF_KEY, prefs);
  }

  function updateGlobalStats() {
    const entries = Object.values(records);
    const attempted = entries.reduce((sum, item) => sum + item.attempts, 0);
    const correct = entries.reduce((sum, item) => sum + item.correct, 0);
    const wrong = entries.filter((item) => item.lastCorrect === false).length;
    const rate = attempted ? Math.round((correct / attempted) * 100) : null;

    elements.headerSeen.textContent = `已练 ${attempted} 题`;
    elements.headerAccuracy.textContent = rate == null ? "正确率 —" : `正确率 ${rate}%`;
    elements.sidebarSeen.textContent = String(attempted);
    elements.sidebarWrong.textContent = String(wrong);
  }

  function renderChapterList() {
    elements.chapterList.replaceChildren();

    const allButton = makeChapterButton("all", "全部章节", data.meta.total, "ALL");
    elements.chapterList.appendChild(allButton);

    for (const chapter of chapters) {
      const button = makeChapterButton(
        String(chapter.id),
        chapter.shortTitle,
        chapter.count,
        String(chapter.id).padStart(2, "0"),
      );
      button.title = chapter.title;
      elements.chapterList.appendChild(button);
    }
  }

  function makeChapterButton(value, name, count, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-button";
    button.dataset.chapter = value;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(prefs.chapter === value));
    button.classList.toggle("active", prefs.chapter === value);

    const indexNode = document.createElement("span");
    indexNode.className = "chapter-index";
    indexNode.textContent = index;

    const nameNode = document.createElement("span");
    nameNode.className = "chapter-name";
    nameNode.textContent = name;

    const countNode = document.createElement("span");
    countNode.className = "chapter-count";
    countNode.textContent = String(count);

    button.append(indexNode, nameNode, countNode);
    button.addEventListener("click", () => {
      prefs.chapter = value;
      savePrefs();
      syncControls();
      renderChapterList();
      startSession();
      closeSidebar();
    });
    return button;
  }

  function syncControls() {
    elements.typeSelect.value = prefs.type;
    elements.sizeSelect.value = prefs.size;
    for (const button of elements.modeGroup.querySelectorAll("button")) {
      button.classList.toggle("active", button.dataset.mode === prefs.mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === prefs.mode));
    }
  }

  function startSession(explicitIds) {
    let pool;
    if (Array.isArray(explicitIds) && explicitIds.length) {
      pool = explicitIds.map((id) => byId.get(id)).filter(Boolean);
    } else {
      pool = filteredQuestions();
      if (prefs.mode === "order") {
        pool.sort((left, right) => left.chapter - right.chapter || left.number - right.number);
      } else {
        pool = shuffle(pool);
      }
      if (prefs.size !== "all") {
        pool = pool.slice(0, Number(prefs.size));
      }
    }

    state.session = {
      ids: pool.map((question) => question.id),
      index: 0,
      answers: {},
      reviews: {},
      label: activeChapterLabel(),
      explicit: Boolean(explicitIds),
    };
    state.selected = [];
    state.completed = false;
    elements.summaryView.hidden = true;
    elements.practiceView.hidden = false;
    renderQuestion();
  }

  function currentQuestion() {
    if (!state.session) return null;
    return byId.get(state.session.ids[state.session.index]) || null;
  }

  function resultFor(question) {
    return state.session && state.session.answers[question.id]
      ? state.session.answers[question.id]
      : null;
  }

  function isRevealed(question) {
    return Boolean(state.session && state.session.reviews[question.id]);
  }

  function renderQuestion() {
    const question = currentQuestion();
    if (!state.session) return;
    if (!question) {
      renderEmptySession();
      return;
    }

    const result = resultFor(question);
    state.selected = result && Array.isArray(result.selected) ? result.selected.slice() : [];
    const position = state.session.index + 1;
    const total = state.session.ids.length;

    elements.chapterLabel.textContent = state.session.label;
    elements.sessionSummary.textContent = `${position} / ${total}`;
    elements.progressBar.style.width = `${total ? (position / total) * 100 : 0}%`;
    elements.chapterTag.textContent = `第 ${question.chapter} 章`;
    elements.typeTag.textContent = question.title;
    elements.questionNumber.textContent = `${position} / ${total}`;
    elements.questionStem.innerHTML = markdownToHTML(question.stem);
    elements.answerZone.replaceChildren();

    if (question.kind === "choice" || question.kind === "judge") {
      renderObjectiveAnswer(question, result);
    } else {
      renderOpenAnswer(question, result);
    }

    renderExplanation(question, result, isRevealed(question));
    renderPostAnswerActions(question, result);
    renderSessionNav();
    updateLiveSessionStats();
    refreshIcons();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderEmptySession() {
    const typeLabel = elements.typeSelect.selectedOptions[0]?.textContent || "当前题型";
    elements.chapterLabel.textContent = state.session.label;
    elements.sessionSummary.textContent = "0 / 0";
    elements.progressBar.style.width = "0%";
    elements.chapterTag.textContent = state.session.label;
    elements.typeTag.textContent = typeLabel;
    elements.questionNumber.textContent = "0 / 0";
    elements.questionStem.innerHTML = "";

    const empty = document.createElement("div");
    empty.className = "empty-question";
    const title = document.createElement("strong");
    title.textContent = "当前范围没有题目";
    const copy = document.createElement("span");
    copy.textContent = "这个章节没有符合所选题型的题目，请调整章节或题型后再开始。";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "button";
    action.textContent = "调整练习范围";
    action.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 860px)").matches) openSidebar();
      else elements.typeSelect.focus();
    });
    empty.append(title, copy, action);

    elements.questionStem.appendChild(empty);
    elements.answerZone.replaceChildren();
    elements.explanation.hidden = true;
    elements.postAnswerActions.hidden = true;
    elements.prevButton.disabled = true;
    elements.nextButton.disabled = true;
    elements.nextButton.querySelector("span").textContent = "下一题";
    elements.correctCount.textContent = "正确 0";
    elements.wrongCount.textContent = "错误 0";
    refreshIcons();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderObjectiveAnswer(question, result) {
    const answered = Boolean(result && typeof result.ok === "boolean");
    const choices = question.kind === "judge"
      ? [
          { value: "对", label: "正确" },
          { value: "错", label: "错误" },
        ]
      : question.options.map((label, index) => ({ value: LETTERS[index], label }));
    const correct = new Set(question.answer);

    for (const choice of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.disabled = answered;
      button.dataset.value = choice.value;
      button.setAttribute("aria-pressed", String(state.selected.includes(choice.value)));

      const picked = state.selected.includes(choice.value);
      if (picked) button.classList.add("selected");
      if (answered && correct.has(choice.value)) button.classList.add("correct");
      else if (answered && picked) button.classList.add("wrong");
      else if (answered && !picked) button.classList.add("muted");

      const letter = document.createElement("span");
      letter.className = "option-letter";
      letter.textContent = question.kind === "judge"
        ? (choice.value === "对" ? "Y" : "N")
        : choice.value;

      const text = document.createElement("span");
      text.className = "option-text markdown";
      text.innerHTML = inlineToHTML(choice.label);

      button.append(letter, text);
      button.addEventListener("click", () => chooseOption(question, choice.value));
      elements.answerZone.appendChild(button);
    }

    if (question.kind === "choice" && question.answer.length > 1 && !answered) {
      const actions = document.createElement("div");
      actions.className = "answer-actions";
      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "button primary";
      submit.textContent = "提交答案";
      submit.disabled = state.selected.length === 0;
      submit.addEventListener("click", () => submitObjective(question));
      actions.appendChild(submit);
      elements.answerZone.appendChild(actions);
    }
  }

  function chooseOption(question, value) {
    const result = resultFor(question);
    if (result && typeof result.ok === "boolean") return;

    if (question.answer.length > 1) {
      const index = state.selected.indexOf(value);
      if (index >= 0) state.selected.splice(index, 1);
      else state.selected.push(value);
      elements.answerZone.replaceChildren();
      renderObjectiveAnswer(question, null);
      renderExplanation(question, null, false);
      return;
    }

    state.selected = [value];
    submitObjective(question);
  }

  function submitObjective(question) {
    const result = resultFor(question);
    if (result && typeof result.ok === "boolean") return;
    if (!state.selected.length) return;

    const selected = state.selected.slice().sort();
    const answer = (Array.isArray(question.answer) ? question.answer.slice() : [question.answer]).sort();
    const ok = selected.length === answer.length && selected.every((value, index) => value === answer[index]);
    completeAnswer(question, ok, selected);
  }

  function completeAnswer(question, ok, selected) {
    if (!state.session.answers[question.id]) {
      recordAttempt(question.id, ok);
    }
    state.session.answers[question.id] = {
      ok,
      selected: selected.slice(),
      answeredAt: Date.now(),
    };
    state.session.reviews[question.id] = true;
    renderQuestion();
    if (window.matchMedia("(max-width: 700px)").matches) {
      window.setTimeout(() => {
        elements.explanation.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 80);
    }
  }

  function recordAttempt(questionId, ok) {
    const current = records[questionId] || {
      attempts: 0,
      correct: 0,
      lastCorrect: null,
      updatedAt: 0,
    };
    current.attempts += 1;
    if (ok) current.correct += 1;
    current.lastCorrect = ok;
    current.updatedAt = Date.now();
    records[questionId] = current;
    saveJSON(RECORD_KEY, records);
    updateGlobalStats();
  }

  function renderOpenAnswer(question, result) {
    const revealed = isRevealed(question);

    const note = document.createElement("div");
    note.className = "open-answer";
    note.innerHTML = revealed
      ? "<p>参考答案和解析已展开。请对照评分点，选择你的掌握情况。</p>"
      : "<p>这类题需要自己组织答案。先在纸上写出要点，再展开参考答案与解析。</p>";
    elements.answerZone.appendChild(note);

    const actions = document.createElement("div");
    actions.className = "answer-actions";

    if (!revealed) {
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "button primary";
      reveal.textContent = "查看答案与解析";
      reveal.addEventListener("click", () => {
        state.session.reviews[question.id] = true;
        renderQuestion();
        if (window.matchMedia("(max-width: 700px)").matches) {
          window.setTimeout(() => {
            elements.explanation.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 80);
        }
      });
      actions.appendChild(reveal);
    }

    if (actions.childElementCount) elements.answerZone.appendChild(actions);
  }

  function renderPostAnswerActions(question, result) {
    elements.postAnswerActions.replaceChildren();
    const assessed = Boolean(result && typeof result.ok === "boolean");
    if (question.kind !== "open" || !isRevealed(question) || assessed) {
      elements.postAnswerActions.hidden = true;
      return;
    }

    const known = document.createElement("button");
    known.type = "button";
    known.className = "button primary";
    known.textContent = "已经掌握";
    known.addEventListener("click", () => completeAnswer(question, true, []));

    const review = document.createElement("button");
    review.type = "button";
    review.className = "button";
    review.textContent = "需要复习";
    review.addEventListener("click", () => completeAnswer(question, false, []));

    elements.postAnswerActions.append(known, review);
    elements.postAnswerActions.hidden = false;
  }

  function renderExplanation(question, result, revealed) {
    if (!result && !revealed) {
      elements.explanation.hidden = true;
      return;
    }

    const ok = result && typeof result.ok === "boolean" ? result.ok : null;
    elements.explanation.hidden = false;
    elements.resultTitle.textContent = ok === true ? "回答正确" : ok === false ? "回答错误" : "参考答案";
    elements.resultMark.className = `result-mark ${ok === true ? "ok" : ok === false ? "no" : "info"}`;
    elements.resultMark.textContent = ok === true ? "✓" : ok === false ? "×" : "i";
    elements.referenceAnswer.innerHTML = formatReferenceAnswer(question);
    elements.explanationText.innerHTML = markdownToHTML(question.explanation);
  }

  function formatReferenceAnswer(question) {
    if (question.kind === "judge") {
      return `<p><strong>${question.answer[0] === "对" ? "正确" : "错误"}</strong></p>`;
    }
    if (question.kind === "choice") {
      return question.answer.map((letter) => {
        const index = LETTERS.indexOf(letter);
        return `<p><strong>${letter}.</strong> ${inlineToHTML(question.options[index] || "")}</p>`;
      }).join("");
    }
    return markdownToHTML(question.answer);
  }

  function renderSessionNav() {
    const session = state.session;
    if (!session) return;
    elements.nextButton.disabled = false;
    elements.prevButton.disabled = session.index === 0;
    const last = session.index === session.ids.length - 1;
    elements.nextButton.querySelector("span").textContent = last ? "查看结果" : "下一题";
  }

  function updateLiveSessionStats() {
    const results = Object.values(state.session.answers)
      .filter((item) => typeof item.ok === "boolean");
    const correct = results.filter((item) => item.ok).length;
    const wrong = results.length - correct;
    elements.correctCount.textContent = `正确 ${correct}`;
    elements.wrongCount.textContent = `错误 ${wrong}`;
  }

  function goPrevious() {
    if (!state.session || state.session.index === 0) return;
    state.session.index -= 1;
    state.selected = [];
    renderQuestion();
  }

  function goNext() {
    if (!state.session) return;
    if (state.session.index >= state.session.ids.length - 1) {
      showSummary();
      return;
    }
    state.session.index += 1;
    state.selected = [];
    renderQuestion();
  }

  function showSummary() {
    state.completed = true;
    elements.practiceView.hidden = true;
    elements.summaryView.hidden = false;

    const answered = Object.values(state.session.answers)
      .filter((item) => typeof item.ok === "boolean");
    const correct = answered.filter((item) => item.ok).length;
    const wrong = answered.length - correct;
    const rate = answered.length ? Math.round((correct / answered.length) * 100) : null;
    const total = state.session.ids.length;
    const unscored = total - answered.length;

    elements.summaryTitle.textContent = answered.length === 0 ? "本轮未作答" : "练习完成";
    elements.summaryCopy.textContent = unscored
      ? `${state.session.label}，本轮 ${total} 题，其中 ${unscored} 题未判分。`
      : `${state.session.label}，本轮 ${total} 题已全部判分。`;
    elements.summaryDone.textContent = String(answered.length);
    elements.summaryCorrect.textContent = String(correct);
    elements.summaryWrong.textContent = String(wrong);
    elements.summaryRate.textContent = rate == null ? "—" : `${rate}%`;

    const wrongIds = state.session.ids.filter((id) => state.session.answers[id]?.ok === false);
    elements.retryWrongButton.disabled = wrongIds.length === 0;
    elements.retryWrongButton.dataset.ids = JSON.stringify(wrongIds);
    elements.retryWrongButton.textContent = wrongIds.length ? `重做错题（${wrongIds.length}）` : "本轮没有错题";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setSidebar(open) {
    elements.sidebar.classList.toggle("open", open);
    elements.scrim.hidden = !open;
    elements.menuButton.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open && window.matchMedia("(max-width: 860px)").matches ? "hidden" : "";
    if (open) elements.closeButton.focus();
  }

  function openSidebar() {
    if (!window.matchMedia("(max-width: 860px)").matches) return;
    setSidebar(true);
  }

  function closeSidebar() {
    if (!elements.sidebar.classList.contains("open")) return;
    setSidebar(false);
    elements.menuButton.focus();
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function resetRecords() {
    if (!window.confirm("清空全部练习记录？已开始的这一轮不会受影响。")) return;
    records = {};
    saveJSON(RECORD_KEY, records);
    updateGlobalStats();
  }

  elements.menuButton.addEventListener("click", openSidebar);
  elements.closeButton.addEventListener("click", closeSidebar);
  elements.scrim.addEventListener("click", closeSidebar);

  elements.typeSelect.addEventListener("change", () => {
    prefs.type = elements.typeSelect.value;
    savePrefs();
    startSession();
  });

  elements.modeGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    prefs.mode = button.dataset.mode;
    savePrefs();
    syncControls();
    startSession();
  });

  elements.sizeSelect.addEventListener("change", () => {
    prefs.size = elements.sizeSelect.value;
    savePrefs();
    startSession();
  });

  elements.startButton.addEventListener("click", () => {
    startSession();
    closeSidebar();
  });
  elements.prevButton.addEventListener("click", goPrevious);
  elements.nextButton.addEventListener("click", goNext);
  elements.resetButton.addEventListener("click", resetRecords);
  elements.againButton.addEventListener("click", () => startSession());
  elements.retryWrongButton.addEventListener("click", () => {
    try {
      const ids = JSON.parse(elements.retryWrongButton.dataset.ids || "[]");
      if (ids.length) startSession(ids);
    } catch {
      // Ignore malformed button state.
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (elements.summaryView.hidden === false) return;
    if (event.key === "Escape") {
      closeSidebar();
      return;
    }

    const question = currentQuestion();
    if (!question) return;
    const result = resultFor(question);
    const answered = Boolean(result && typeof result.ok === "boolean");

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
      return;
    }
    if (event.key === "ArrowRight" || (event.key === "Enter" && (answered || isRevealed(question)))) {
      event.preventDefault();
      goNext();
      return;
    }
    if (question.kind === "open") {
      if (event.key === "Enter" && !isRevealed(question)) {
        event.preventDefault();
        const button = elements.answerZone.querySelector("button.primary");
        if (button) button.click();
      }
      return;
    }

    if (answered) return;
    const key = event.key.toUpperCase();
    if (question.kind === "judge") {
      if (key === "A" || key === "1") chooseOption(question, "对");
      if (key === "B" || key === "2") chooseOption(question, "错");
      return;
    }

    const choiceIndex = /^[1-6]$/.test(event.key)
      ? Number(event.key) - 1
      : LETTERS.indexOf(key);
    if (choiceIndex >= 0 && choiceIndex < question.options.length) {
      chooseOption(question, LETTERS[choiceIndex]);
    }
  });

  function init() {
    window.addEventListener("resize", () => {
      if (window.matchMedia("(max-width: 860px)").matches) return;
      elements.sidebar.classList.remove("open");
      elements.scrim.hidden = true;
      elements.menuButton.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }, { passive: true });
    renderChapterList();
    syncControls();
    updateGlobalStats();
    startSession();
    refreshIcons();
  }

  init();
})();
