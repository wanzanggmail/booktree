(function () {
  const STORAGE_PREFIX = "chaeknamu-cbt-v1:";
  const PROFILE_KEY = "hoho-study:profile";

  const els = {
    home: document.getElementById("screen-home"),
    start: document.getElementById("screen-start"),
    quiz: document.getElementById("screen-quiz"),
    result: document.getElementById("screen-result"),
    quizList: document.getElementById("quiz-list"),
    quizSearch: document.getElementById("quiz-search"),
    subjectFilters: document.getElementById("subject-filters"),
    quizListStatus: document.getElementById("quiz-list-status"),
    androidUpdate: document.getElementById("android-update"),
    androidVersion: document.getElementById("android-version"),
    btnAppUpdate: document.getElementById("btn-app-update"),
    startEyebrow: document.getElementById("start-eyebrow"),
    startTitle: document.getElementById("start-title"),
    startDesc: document.getElementById("start-desc"),
    quizNotice: document.getElementById("quiz-notice"),
    orderPicker: document.getElementById("order-picker"),
    lessonPicker: document.getElementById("lesson-picker"),
    lessonOptions: document.getElementById("lesson-options"),
    lessonCount: document.getElementById("lesson-count"),
    nameInput: document.getElementById("name-input"),
    nameField: document.getElementById("name-field"),
    profileName: document.getElementById("profile-name"),
    profileEditor: document.getElementById("profile-editor"),
    profileInput: document.getElementById("profile-name-input"),
    btnEditName: document.getElementById("btn-edit-name"),
    btnCancelName: document.getElementById("btn-cancel-name"),
    btnBackHome: document.getElementById("btn-back-home"),
    btnStart: document.getElementById("btn-start"),
    btnResume: document.getElementById("btn-resume"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
    btnCheck: document.getElementById("btn-check"),
    checkFeedback: document.getElementById("check-feedback"),
    btnRestart: document.getElementById("btn-restart"),
    btnHome: document.getElementById("btn-home"),
    questionArea: document.getElementById("question-area"),
    progressLabel: document.getElementById("progress-label"),
    progressBar: document.getElementById("progress-bar"),
    quizName: document.getElementById("quiz-name"),
    resultSummary: document.getElementById("result-summary"),
    resultList: document.getElementById("result-list"),
  };

  let quizCatalog = [];
  let homeSubject = "all";
  let homeSearch = "";
  let profileName = "";
  let currentQuiz = null;
  let originalQuestions = [];
  let activeQuestions = [];
  let questions = [];
  let answerKey = {};
  let state = {
    name: "",
    index: 0,
    answers: {},
    order: [],
    lessons: [],
    orderMode: "random",
  };

  function storageKey() {
    return STORAGE_PREFIX + (currentQuiz?.id || "default");
  }

  function refreshProfile() {
    els.profileName.textContent = profileName ? `${profileName} 님` : "이름은 첫 학습 때 한 번만 입력해 주세요.";
    els.btnEditName.classList.toggle("hidden", !profileName);
    els.nameField.classList.toggle("hidden", !!profileName);
    els.nameInput.value = profileName;
  }

  function rememberName(name) {
    profileName = String(name).trim().slice(0, 20);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: profileName }));
    } catch (err) {
      console.warn("이름 저장 실패", err);
    }
    refreshProfile();
  }

  function restoreProfile() {
    try {
      const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      if (typeof stored?.name === "string" && stored.name.trim()) {
        profileName = stored.name.trim().slice(0, 20);
      } else {
        // Reuse the latest name from existing quizzes when upgrading the app.
        const previous = quizCatalog.map(quiz => {
          try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + quiz.id) || "null"); }
          catch { return null; }
        }).filter(saved => typeof saved?.name === "string" && saved.name.trim())
          .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
        if (previous.length) rememberName(previous[0].name);
      }
    } catch (err) {
      console.warn("이름 불러오기 실패", err);
    }
    refreshProfile();
  }

  function showScreen(name) {
    [els.home, els.start, els.quiz, els.result].forEach((el) => el.classList.remove("active"));
    if (name === "home") els.home.classList.add("active");
    if (name === "start") els.start.classList.add("active");
    if (name === "quiz") els.quiz.classList.add("active");
    if (name === "result") els.result.classList.add("active");
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (currentQuiz?.revision && saved.revision !== currentQuiz.revision) return null;
      return saved;
    } catch {
      return null;
    }
  }

  function saveState() {
    if (!currentQuiz) return;
    localStorage.setItem(
      storageKey(),
      JSON.stringify({
        name: state.name,
        ...(currentQuiz.revision ? { revision: currentQuiz.revision } : {}),
        index: state.index,
        answers: state.answers,
        order: state.order || [],
        lessons: state.lessons || [],
        orderMode: state.orderMode,
        updatedAt: Date.now(),
      })
    );
  }

  function clearState() {
    if (!currentQuiz) return;
    localStorage.removeItem(storageKey());
  }

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function hasKeyAnswer(id) {
    if (!(id in answerKey)) return false;
    const key = answerKey[id];
    if (key == null) return false;
    if (typeof key === "string" && key.trim() === "") return false;
    if (Array.isArray(key) && key.length === 0) return false;
    if (typeof key === "object" && !Array.isArray(key) && Object.keys(key).length === 0) {
      return false;
    }
    return true;
  }

  function getUserAnswer(id) {
    return state.answers[id];
  }

  function isAnswered(q) {
    const value = getUserAnswer(q.id);
    if (q.type === "cloze") return window.CBTCloze.isComplete(q, value);
    if (q.type === "multi") return Array.isArray(value) && value.length > 0;
    if (q.type === "essay") return typeof value === "string" && value.trim() !== "";
    return value != null && String(value).trim() !== "";
  }

  function sameMulti(a, b) {
    const left = [...(Array.isArray(a) ? a : [])].map(normalizeText).sort();
    const right = [...(Array.isArray(b) ? b : [])].map(normalizeText).sort();
    if (left.length !== right.length) return false;
    return left.every((v, i) => v === right[i]);
  }

  function gradeOne(q) {
    if (q.type === "cloze") {
      return window.CBTCloze.grade(q, getUserAnswer(q.id), answerKey[q.id]);
    }
    if (q.type === "essay") {
      return {
        status: isAnswered(q) ? "essay_done" : "essay_empty",
        user: getUserAnswer(q.id) || "",
        correct: null,
      };
    }

    if (!hasKeyAnswer(q.id)) {
      return {
        status: "ungraded",
        user: getUserAnswer(q.id) ?? "",
        correct: null,
      };
    }

    const key = answerKey[q.id];
    const user = getUserAnswer(q.id);

    if (q.type === "multi") {
      const ok = sameMulti(user, key);
      return { status: ok ? "correct" : "wrong", user: user || [], correct: key };
    }

    const ok = normalizeText(user) === normalizeText(key);
    return {
      status: ok ? "correct" : "wrong",
      user: user ?? "",
      correct: key,
    };
  }

  function formatValue(value) {
    if (Array.isArray(value)) return value.join(", ") || "(없음)";
    if (value == null || String(value).trim() === "") return "(없음)";
    return String(value);
  }

  function currentQuestion() {
    return questions[state.index];
  }

  function shuffle(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function applyOrder(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      questions = [...activeQuestions];
      return;
    }
    const byId = new Map(activeQuestions.map((q) => [String(q.id), q]));
    const used = new Set();
    const ordered = [];
    for (const id of orderIds) {
      const q = byId.get(String(id));
      if (q && !used.has(String(id))) {
        ordered.push(q);
        used.add(String(id));
      }
    }
    for (const q of activeQuestions) {
      if (!used.has(String(q.id))) ordered.push(q);
    }
    questions = ordered;
  }

  function updateProgress() {
    const total = questions.length;
    const current = state.index + 1;
    els.progressLabel.textContent = `${current} / ${total}`;
    els.progressBar.style.width = `${(current / total) * 100}%`;
    els.quizName.textContent = state.name || "";
    els.btnPrev.disabled = state.index === 0;
    els.btnNext.textContent = state.index === total - 1 ? "제출" : "다음";
  }

  function goNext() {
    if (state.index >= questions.length - 1) {
      submitQuiz();
    } else {
      goTo(state.index + 1);
    }
  }

  function clearCheckFeedback() {
    els.checkFeedback.className = "check-feedback hidden";
    els.checkFeedback.innerHTML = "";
    const exampleToggle = els.questionArea.querySelector(".example-toggle");
    const examplePanel = els.questionArea.querySelector(".example-panel");
    if (exampleToggle) {
      exampleToggle.disabled = true;
      exampleToggle.setAttribute("aria-expanded", "false");
      exampleToggle.textContent = "예문";
    }
    if (examplePanel) examplePanel.classList.add("hidden");
    const review = els.questionArea.querySelector(".cloze-review");
    if (review) {
      review.classList.add("hidden");
      review.innerHTML = "";
    }
    els.questionArea
      .querySelectorAll(".mark-wrong, .mark-correct")
      .forEach((el) => el.classList.remove("mark-wrong", "mark-correct"));
  }

  function escapeFeedback(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function underlineAnswerInHelp(helpText, answer) {
    const text = String(helpText ?? "");
    const ans = String(answer ?? "").trim();
    if (!text) return "";
    if (!ans) return escapeFeedback(text);

    const stems = [ans];
    if (ans.endsWith("하다") || ans.endsWith("되다") || ans.endsWith("지다")) {
      stems.push(ans.slice(0, -2));
    }

    let matchIndex = -1;
    let matchStem = "";
    for (const stem of stems) {
      if (!stem) continue;
      const idx = text.indexOf(stem);
      if (idx >= 0) {
        matchIndex = idx;
        matchStem = stem;
        break;
      }
    }

    if (matchIndex < 0) return escapeFeedback(text);

    let end = matchIndex + matchStem.length;
    if (text.slice(matchIndex, matchIndex + ans.length) === ans) {
      end = matchIndex + ans.length;
    }
    while (end < text.length && /[가-힣A-Za-z0-9]/.test(text[end])) {
      end += 1;
    }

    return (
      escapeFeedback(text.slice(0, matchIndex)) +
      `<u class="answer-underline">${escapeFeedback(text.slice(matchIndex, end))}</u>` +
      escapeFeedback(text.slice(end))
    );
  }

  function showCheckFeedback(kind, message, helpText, answer) {
    els.checkFeedback.className = `check-feedback ${kind}`;
    let html = `<div class="check-main">${escapeFeedback(message)}</div>`;
    if (helpText) {
      html += `<div class="check-help">${underlineAnswerInHelp(helpText, answer)}</div>`;
    }
    els.checkFeedback.innerHTML = html;
  }

  function markChoiceResult(q, grade) {
    if (q.type === "cloze") {
      els.questionArea.querySelectorAll(".cloze-input").forEach((input, index) => {
        input.classList.add(grade.slots[index].ok ? "mark-correct" : "mark-wrong");
      });
      const review = els.questionArea.querySelector(".cloze-review");
      review.innerHTML = `<strong>정답 문장</strong>
        <p lang="en" class="complete-sentence">${escapeFeedback(q.sentence)}</p>
        <p class="cloze-key">빈칸 정답: ${grade.correct.map((word, index) => `${index + 1}) ${escapeFeedback(word)}`).join(" · ")}</p>
        <p>${escapeFeedback(q.explanation)}</p>`;
      review.classList.remove("hidden");
      return;
    }
    if (q.type === "text" || q.type === "essay") {
      const input = els.questionArea.querySelector(".answer-input, .essay-input");
      if (!input) return;
      if (grade.status === "wrong") input.classList.add("mark-wrong");
      if (grade.status === "correct") input.classList.add("mark-correct");
      return;
    }

    if (q.type === "multi") {
      const correctSet = new Set(
        (Array.isArray(grade.correct) ? grade.correct : []).map((v) => normalizeText(v))
      );
      els.questionArea.querySelectorAll(".multi-opt").forEach((label) => {
        const val = normalizeText(label.querySelector("input")?.value);
        const checked = label.querySelector("input")?.checked;
        if (checked && !correctSet.has(val)) label.classList.add("mark-wrong");
        if (correctSet.has(val) && grade.status === "wrong") label.classList.add("mark-correct");
      });
      return;
    }

    // choice / match / ox / choice_pool
    els.questionArea.querySelectorAll("[data-value]").forEach((btn) => {
      const val = btn.getAttribute("data-value");
      if (grade.status === "wrong" && normalizeText(val) === normalizeText(grade.user)) {
        btn.classList.add("mark-wrong");
      }
      if (grade.status === "correct" && normalizeText(val) === normalizeText(grade.user)) {
        btn.classList.add("mark-correct");
      }
      if (
        grade.status === "wrong" &&
        normalizeText(val) === normalizeText(grade.correct)
      ) {
        btn.classList.add("mark-correct");
      }
    });
  }

  function checkCurrentAnswer() {
    const q = currentQuestion();
    if (!q) return;

    clearCheckFeedback();

    const hasAnswer = q.type === "cloze" ? window.CBTCloze.hasAny(getUserAnswer(q.id)) : isAnswered(q);
    if (!hasAnswer) {
      showCheckFeedback("info", q.type === "text" || q.type === "essay" || q.type === "cloze"
        ? "먼저 답을 입력한 뒤 확인해 주세요."
        : "먼저 답을 선택한 뒤 확인해 주세요.");
      return;
    }

    const grade = gradeOne(q);
    if (q.type === "cloze" && grade.slots) {
      markChoiceResult(q, grade);
      const label = grade.status === "correct" ? "모두 정답입니다!"
        : grade.status === "partial" ? "부분 정답입니다." : "다시 확인해 보세요.";
      showCheckFeedback(grade.status === "correct" ? "ok" : grade.status === "partial" ? "info" : "bad",
        `${label} 빈칸 ${grade.earned}/${grade.total}점`);
      return;
    }
    const help = q.meaning ? `한글 뜻: ${q.meaning}` : q.help || "";
    const correctAnswer = grade.correct != null ? grade.correct : answerKey[q.id];

    if (grade.status === "correct") {
      markChoiceResult(q, grade);
      showCheckFeedback("ok", q.meaning
        ? `정답입니다! ${formatValue(correctAnswer)}`
        : "정답입니다!", help, correctAnswer);
      return;
    }
    if (grade.status === "wrong") {
      markChoiceResult(q, grade);
      const exampleToggle = els.questionArea.querySelector(".example-toggle");
      if (exampleToggle) exampleToggle.disabled = false;
      showCheckFeedback(
        "bad",
        `오답입니다. 정답: ${formatValue(grade.correct)}`,
        help,
        correctAnswer
      );
      return;
    }
    if (grade.status === "essay_done" || grade.status === "essay_empty") {
      showCheckFeedback("info", "예문 문항은 자동 채점하지 않습니다.", help, correctAnswer);
      return;
    }
    showCheckFeedback(
      "info",
      "이 문항은 아직 정답지가 없어 채점할 수 없습니다.",
      help,
      correctAnswer
    );
  }

  function renderCurrent() {
    const q = currentQuestion();
    if (!q) return;
    clearCheckFeedback();
    const value = getUserAnswer(q.id);
    els.questionArea.innerHTML = window.CBTRender.render(q, value);
    window.CBTRender.bind(
      els.questionArea,
      q,
      (nextValue) => {
        state.answers[q.id] = nextValue;
        saveState();
        clearCheckFeedback();
      },
      {
        onEnter: () => goNext(),
        onCheck: () => checkCurrentAnswer(),
      }
    );
    updateProgress();
    els.questionArea.scrollTop = 0;

    const input = els.questionArea.querySelector(".answer-input, .cloze-input");
    if (input) {
      requestAnimationFrame(() => input.focus());
    }
  }

  function goTo(index) {
    state.index = Math.max(0, Math.min(index, questions.length - 1));
    saveState();
    renderCurrent();
  }

  function startQuiz(resume) {
    const name = (profileName || els.nameInput.value || state.name || "").trim();
    if (!name) {
      els.nameInput.focus();
      alert("이름을 입력해 주세요.");
      return;
    }
    state.name = name;
    if (getAvailableLessonIds().length) {
      const selected = resume
        ? (state.lessons.length ? state.lessons : getAvailableLessonIds())
        : getSelectedLessons();
      if (!selected.length) {
        alert("출제할 Lesson을 하나 이상 선택해 주세요.");
        return;
      }
      state.lessons = selected;
      setSelectedLessons(selected);
      activeQuestions = originalQuestions.filter((q) => selected.includes(Number(q.source?.lesson)));
      if (!activeQuestions.length) {
        alert("선택한 Lesson의 문제를 찾을 수 없습니다.");
        return;
      }
    } else {
      activeQuestions = [...originalQuestions];
    }
    if (!resume) {
      state.index = 0;
      state.answers = {};
      state.orderMode = currentQuiz.allowOrderSelection
        ? (els.orderPicker.querySelector("input:checked")?.value || currentQuiz.defaultOrder)
        : "random";
      questions = state.orderMode === "source" ? [...activeQuestions] : shuffle(activeQuestions);
      state.order = questions.map((q) => q.id);
    } else {
      setOrderMode(state.orderMode);
      applyOrder(state.order);
      state.index = Math.max(0, Math.min(state.index, questions.length - 1));
    }
    rememberName(name);
    saveState();
    showScreen("quiz");
    renderCurrent();
  }

  function showResult() {
    const rows = questions.map((q) => ({ q, grade: gradeOne(q) }));
    const auto = rows.filter((r) => ["correct", "wrong", "partial"].includes(r.grade.status));
    const correct = auto.filter((r) => r.grade.status === "correct").length;
    const wrong = auto.filter((r) => r.grade.status === "wrong").length;
    const partial = auto.filter((r) => r.grade.status === "partial").length;
    const ungraded = rows.filter((r) => r.grade.status === "ungraded").length;
    const essays = rows.filter((r) => r.q.type === "essay");
    const essayDone = essays.filter((r) => r.grade.status === "essay_done").length;

    let summary = `${state.name} 님 · ${currentQuiz?.title || ""} · 자동채점 ${correct}/${auto.length}점 (틀림 ${wrong}`;
    if (ungraded) summary += `, 미채점 ${ungraded}`;
    summary += ")";
    if (essays.length) summary += ` · 예문 작성 ${essayDone}/${essays.length}`;
    const clozeRows = rows.filter(r => r.q.type === "cloze");
    if (clozeRows.length) {
      const earned = clozeRows.reduce((sum, row) => sum + (row.grade.earned || 0), 0);
      const total = clozeRows.reduce((sum, row) => sum + (row.grade.total || row.q.blankCount), 0);
      summary = `${state.name} 님 · ${currentQuiz.title} · 빈칸 ${earned}/${total}점`
        + ` · 문장 정답 ${correct}/${rows.length} (부분 정답 ${partial}, 오답 ${wrong})`;
    }
    els.resultSummary.textContent = summary;

    els.resultList.innerHTML = rows
      .map(({ q, grade }) => {
        const id = escapeFeedback(q.id);
        const user = escapeFeedback(formatValue(grade.user));
        const correctAnswer = escapeFeedback(formatValue(grade.correct));
        const meaning = q.meaning ? `<br />한글 뜻: ${escapeFeedback(q.meaning)}` : "";
        if (q.type === "cloze" && grade.slots) {
          const label = grade.status === "correct" ? "정답" : grade.status === "partial" ? "부분 정답" : "오답";
          const slots = grade.slots.map((slot, index) => `<li class="${slot.ok ? "slot-correct" : "slot-wrong"}">
            ${index + 1}) 내 답: ${escapeFeedback(formatValue(slot.user))} · 정답: ${escapeFeedback(slot.correct)}</li>`).join("");
          return `<div class="result-item ${grade.status}"><span class="status">${label} · Lesson ${escapeFeedback(q.source.lesson)} 문장 ${escapeFeedback(q.sentenceNumber)} · ${grade.earned}/${grade.total}점</span>
            <div class="detail"><p lang="en">${escapeFeedback(q.sentence)}</p>
            <ul class="slot-results">${slots}</ul><p>해석: ${escapeFeedback(q.translation)}</p></div></div>`;
        }
        if (grade.status === "correct") {
          return `<div class="result-item correct"><span class="status">정답 · ${id}번</span><div class="detail">내 답: ${user}${meaning}</div></div>`;
        }
        if (grade.status === "wrong") {
          return `<div class="result-item wrong"><span class="status">오답 · ${id}번</span><div class="detail">내 답: ${user}<br />정답: ${correctAnswer}${meaning}</div></div>`;
        }
        if (grade.status === "essay_done" || grade.status === "essay_empty") {
          const label = grade.status === "essay_done" ? "예문 작성함" : "예문 미작성";
          return `<div class="result-item essay"><span class="status">${label} · ${id}번 (${escapeFeedback(q.prompt)})</span><div class="detail">${user}</div></div>`;
        }
        return `<div class="result-item skip"><span class="status">미채점 · ${id}번</span><div class="detail">내 답: ${user}<br />answers.json에 정답을 채워 주세요.</div></div>`;
      })
      .join("");

    showScreen("result");
  }

  function submitQuiz() {
    const unanswered = questions.filter((q) => !isAnswered(q)).length;
    if (unanswered > 0) {
      const ok = confirm(`아직 ${unanswered}문항의 답안이 완성되지 않았습니다. 그대로 제출할까요?`);
      if (!ok) return;
    }
    showResult();
  }

  function renderHome() {
    const subjects = [...new Set(quizCatalog.map(quiz => quiz.subject || "기타"))];
    if (els.subjectFilters.dataset.catalog !== JSON.stringify(subjects)) {
      els.subjectFilters.dataset.catalog = JSON.stringify(subjects);
      els.subjectFilters.innerHTML = ["all", ...subjects].map(subject => {
        const count = subject === "all" ? quizCatalog.length
          : quizCatalog.filter(quiz => (quiz.subject || "기타") === subject).length;
        return `<button type="button" class="subject-filter" data-subject="${escapeFeedback(subject)}" aria-pressed="false">
          ${subject === "all" ? "전체" : escapeFeedback(subject)} <span>${count}</span></button>`;
      }).join("");
    }
    els.subjectFilters.querySelectorAll("[data-subject]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.subject === homeSubject));
    });

    const searchText = value => normalizeText(value).normalize("NFKC").replace(/\s/g, "");
    const query = searchText(homeSearch);
    const visible = quizCatalog.filter(quiz => {
      if (homeSubject !== "all" && (quiz.subject || "기타") !== homeSubject) return false;
      const terms = [quiz.title, quiz.shortTitle, quiz.subtitle, quiz.description, quiz.subject,
        ...(quiz.lessons || []).map(lesson => `Lesson ${lesson} ${lesson}과`)];
      return !query || searchText(terms.filter(Boolean).join(" ")).includes(query);
    });
    els.quizListStatus.textContent = `${visible.length}개`;
    els.quizList.innerHTML = subjects.map(subject => {
      const group = visible.filter(quiz => (quiz.subject || "기타") === subject);
      if (!group.length) return "";
      return `<section class="quiz-group" aria-label="${escapeFeedback(subject)} 학습">
        <h3>${escapeFeedback(subject)}</h3><div class="quiz-group-list">${group.map(quiz => `
          <button type="button" class="quiz-card quiz-row" data-quiz-id="${escapeFeedback(quiz.id)}">
            <span class="quiz-row-copy"><strong>${escapeFeedback(quiz.shortTitle || quiz.title)}</strong>
              <span class="quiz-row-meta">${escapeFeedback(quiz.homeDetail || quiz.subtitle || "")}</span></span>
            <span class="quiz-row-count">${escapeFeedback(quiz.questionCount ?? "")}<small>${escapeFeedback(quiz.countUnit || "문항")}</small></span>
            <span class="quiz-row-chevron" aria-hidden="true">›</span>
          </button>`).join("")}</div></section>`;
    }).join("");
    if (!visible.length) {
      els.quizList.innerHTML = `<div class="quiz-empty"><p>일치하는 학습이 없어요.</p>
        <button type="button" id="btn-reset-library" class="btn btn-ghost">목록 초기화</button></div>`;
      document.getElementById("btn-reset-library").addEventListener("click", () => {
        homeSubject = "all";
        homeSearch = "";
        els.quizSearch.value = "";
        renderHome();
        els.quizSearch.focus();
      });
    }

    els.quizList.querySelectorAll(".quiz-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-quiz-id");
        openQuiz(id);
      });
    });
  }

  function getAvailableLessonIds() {
    return Array.isArray(currentQuiz?.lessons)
      ? currentQuiz.lessons.map(Number)
      : [];
  }

  function getSelectedLessons() {
    return Array.from(els.lessonOptions.querySelectorAll("input[name='lesson']:checked"))
      .map((input) => Number(input.value));
  }

  function setSelectedLessons(selected) {
    const selectedSet = new Set(selected.map(Number));
    els.lessonOptions.querySelectorAll("input[name='lesson']").forEach((input) => {
      input.checked = selectedSet.has(Number(input.value));
    });
    updateLessonCount();
  }

  function updateLessonCount() {
    const selected = getSelectedLessons();
    const questionCount = originalQuestions.filter((q) => selected.includes(Number(q.source?.lesson))).length;
    els.lessonCount.textContent = selected.length
      ? `선택한 단원: ${selected.map((lesson) => `Lesson ${lesson}`).join(", ")} · ${questionCount}문항`
      : "한 개 이상 선택해 주세요.";
  }

  function renderLessonPicker(lessons, selected) {
    const pending = currentQuiz.pendingLessons || [];
    const all = [...lessons, ...pending].sort((a, b) => a - b);
    els.lessonOptions.innerHTML = all.map((lesson) => `
      <label class="lesson-option">
        <input type="checkbox" name="lesson" value="${Number(lesson)}" ${pending.includes(lesson) ? "disabled" : ""} />
        <span>Lesson ${Number(lesson)}${pending.includes(lesson) ? " (자료 대기)" : ""}</span>
      </label>
    `).join("");
    setSelectedLessons(selected);
    els.lessonPicker.classList.remove("hidden");
  }

  function setOrderMode(mode) {
    els.orderPicker.querySelectorAll("input[name='question-order']").forEach(input => {
      input.checked = input.value === mode;
    });
  }

  async function openQuiz(quizId) {
    const meta = quizCatalog.find((q) => q.id === quizId);
    if (!meta) return;

    try {
      const [qRes, aRes] = await Promise.all([fetch(meta.questionsUrl), fetch(meta.answersUrl)]);
      if (!qRes.ok || !aRes.ok) throw new Error("데이터 로드 실패");
      const qData = await qRes.json();
      const aData = await aRes.json();

      currentQuiz = meta;
      originalQuestions = qData.questions || [];
      activeQuestions = [...originalQuestions];
      questions = [...originalQuestions];
      answerKey = { ...aData };
      delete answerKey._설명;

      els.startEyebrow.textContent = qData.subtitle || meta.subtitle || "";
      els.startTitle.textContent = meta.title || qData.title;
      els.startDesc.textContent = `${meta.description || "한 화면에 한 문제씩"} · 총 ${questions.length}문항`;
      els.quizNotice.textContent = meta.notice || "";
      els.quizNotice.classList.toggle("hidden", !meta.notice);

      const saved = loadState();
      if (saved && saved.name) {
        state = {
          name: saved.name,
          index: Number.isInteger(saved.index) ? saved.index : 0,
          answers: saved.answers || {},
          order: saved.order || [],
          lessons: Array.isArray(saved.lessons) ? saved.lessons : [],
          orderMode: ["source", "random"].includes(saved.orderMode) ? saved.orderMode : meta.defaultOrder || "random",
        };
        els.nameInput.value = saved.name;
        els.btnResume.classList.remove("hidden");
      } else {
        state = { name: "", index: 0, answers: {}, order: [], lessons: [], orderMode: meta.defaultOrder || "random" };
        els.nameInput.value = "";
        els.btnResume.classList.add("hidden");
      }

      els.orderPicker.classList.toggle("hidden", !meta.allowOrderSelection);
      setOrderMode(state.orderMode);
      if (Array.isArray(meta.lessons) && meta.lessons.length) {
        renderLessonPicker(meta.lessons, state.lessons.length ? state.lessons : meta.lessons);
      } else {
        els.lessonPicker.classList.add("hidden");
        els.lessonOptions.innerHTML = "";
      }

      refreshProfile();
      showScreen("start");
      if (profileName) els.btnStart.focus();
      else els.nameInput.focus();
    } catch (err) {
      console.error(err);
      alert("문제 데이터를 불러오지 못했습니다. 로컬 서버로 열어 주세요.");
    }
  }

  async function init() {
    els.btnEditName.addEventListener("click", () => {
      els.profileEditor.classList.remove("hidden");
      els.profileInput.value = profileName;
      els.profileInput.focus();
      els.profileInput.select();
    });
    els.btnCancelName.addEventListener("click", () => {
      els.profileEditor.classList.add("hidden");
      els.btnEditName.focus();
    });
    els.profileInput.addEventListener("input", () => els.profileInput.setCustomValidity(""));
    els.profileEditor.addEventListener("submit", event => {
      event.preventDefault();
      if (!els.profileInput.value.trim()) {
        els.profileInput.setCustomValidity("이름을 입력해 주세요.");
        els.profileInput.reportValidity();
        return;
      }
      rememberName(els.profileInput.value);
      els.profileEditor.classList.add("hidden");
      els.btnEditName.focus();
    });
    els.quizSearch.addEventListener("input", () => {
      homeSearch = els.quizSearch.value;
      renderHome();
    });
    els.subjectFilters.addEventListener("click", event => {
      const button = event.target.closest("[data-subject]");
      if (!button) return;
      homeSubject = button.dataset.subject;
      renderHome();
    });
    const android = window.BooktreeAndroid;
    if (android && typeof android.getVersionName === "function"
      && typeof android.checkForUpdates === "function") {
      els.androidVersion.textContent = `Android 앱 v${android.getVersionName()}`;
      els.androidUpdate.classList.remove("hidden");
      els.btnAppUpdate.addEventListener("click", () => android.checkForUpdates());
    }
    try {
      const res = await fetch("data/quizzes.json");
      if (!res.ok) throw new Error("catalog");
      quizCatalog = await res.json();
      restoreProfile();
      renderHome();
    } catch (err) {
      console.error(err);
      els.home.querySelector(".start-inner").innerHTML = `
        <h1>불러오기 실패</h1>
        <p class="start-desc">로컬 서버로 열어 주세요.<br />예: <code>npx serve .</code></p>
      `;
      return;
    }

    els.btnBackHome.addEventListener("click", () => showScreen("home"));
    els.btnHome.addEventListener("click", () => showScreen("home"));
    els.btnStart.addEventListener("click", () => startQuiz(false));
    els.btnResume.addEventListener("click", () => startQuiz(true));
    els.lessonOptions.addEventListener("change", updateLessonCount);
    els.btnPrev.addEventListener("click", () => goTo(state.index - 1));
    els.btnNext.addEventListener("click", () => goNext());
    els.btnCheck.addEventListener("click", () => checkCurrentAnswer());
    els.btnRestart.addEventListener("click", () => {
      clearState();
      state = { name: "", index: 0, answers: {}, order: [], lessons: [], orderMode: currentQuiz.defaultOrder || "random" };
      setOrderMode(state.orderMode);
      refreshProfile();
      els.btnResume.classList.add("hidden");
      showScreen("start");
    });

    els.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") startQuiz(false);
    });
  }

  init();
})();
