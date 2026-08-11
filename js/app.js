(function () {
  const STORAGE_PREFIX = "chaeknamu-cbt-v1:";

  const els = {
    home: document.getElementById("screen-home"),
    start: document.getElementById("screen-start"),
    quiz: document.getElementById("screen-quiz"),
    result: document.getElementById("screen-result"),
    quizList: document.getElementById("quiz-list"),
    startEyebrow: document.getElementById("start-eyebrow"),
    startTitle: document.getElementById("start-title"),
    startDesc: document.getElementById("start-desc"),
    nameInput: document.getElementById("name-input"),
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
  let currentQuiz = null;
  let questions = [];
  let answerKey = {};
  let state = {
    name: "",
    index: 0,
    answers: {},
  };

  function storageKey() {
    return STORAGE_PREFIX + (currentQuiz?.id || "default");
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
      return JSON.parse(raw);
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
        index: state.index,
        answers: state.answers,
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
    els.checkFeedback.textContent = "";
    els.questionArea
      .querySelectorAll(".mark-wrong, .mark-correct")
      .forEach((el) => el.classList.remove("mark-wrong", "mark-correct"));
  }

  function showCheckFeedback(kind, message) {
    els.checkFeedback.className = `check-feedback ${kind}`;
    els.checkFeedback.textContent = message;
  }

  function markChoiceResult(q, grade) {
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

    if (!isAnswered(q)) {
      showCheckFeedback("info", "먼저 답을 선택한 뒤 확인해 주세요.");
      return;
    }

    const grade = gradeOne(q);

    if (grade.status === "correct") {
      markChoiceResult(q, grade);
      showCheckFeedback("ok", "정답입니다!");
      return;
    }
    if (grade.status === "wrong") {
      markChoiceResult(q, grade);
      showCheckFeedback("bad", `오답입니다. 정답: ${formatValue(grade.correct)}`);
      return;
    }
    if (grade.status === "essay_done" || grade.status === "essay_empty") {
      showCheckFeedback("info", "예문 문항은 자동 채점하지 않습니다.");
      return;
    }
    showCheckFeedback("info", "이 문항은 아직 정답지가 없어 채점할 수 없습니다.");
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
      }
    );
    updateProgress();
    els.questionArea.scrollTop = 0;

    const input = els.questionArea.querySelector(".answer-input");
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
    const name = (els.nameInput.value || state.name || "").trim();
    if (!name) {
      els.nameInput.focus();
      alert("이름을 입력해 주세요.");
      return;
    }
    state.name = name;
    if (!resume) {
      state.index = 0;
      state.answers = {};
    } else if (state.index >= questions.length) {
      state.index = 0;
    }
    saveState();
    showScreen("quiz");
    renderCurrent();
  }

  function showResult() {
    const rows = questions.map((q) => ({ q, grade: gradeOne(q) }));
    const auto = rows.filter((r) => r.grade.status === "correct" || r.grade.status === "wrong");
    const correct = auto.filter((r) => r.grade.status === "correct").length;
    const wrong = auto.filter((r) => r.grade.status === "wrong").length;
    const ungraded = rows.filter((r) => r.grade.status === "ungraded").length;
    const essays = rows.filter((r) => r.q.type === "essay");
    const essayDone = essays.filter((r) => r.grade.status === "essay_done").length;

    let summary = `${state.name} 님 · ${currentQuiz?.title || ""} · 자동채점 ${correct}/${auto.length}점 (틀림 ${wrong}`;
    if (ungraded) summary += `, 미채점 ${ungraded}`;
    summary += ")";
    if (essays.length) summary += ` · 예문 작성 ${essayDone}/${essays.length}`;
    els.resultSummary.textContent = summary;

    els.resultList.innerHTML = rows
      .map(({ q, grade }) => {
        if (grade.status === "correct") {
          return `<div class="result-item correct"><span class="status">정답 · ${q.id}번</span><div class="detail">내 답: ${formatValue(grade.user)}</div></div>`;
        }
        if (grade.status === "wrong") {
          return `<div class="result-item wrong"><span class="status">오답 · ${q.id}번</span><div class="detail">내 답: ${formatValue(grade.user)}<br />정답: ${formatValue(grade.correct)}</div></div>`;
        }
        if (grade.status === "essay_done" || grade.status === "essay_empty") {
          const label = grade.status === "essay_done" ? "예문 작성함" : "예문 미작성";
          return `<div class="result-item essay"><span class="status">${label} · ${q.id}번 (${q.prompt})</span><div class="detail">${formatValue(grade.user)}</div></div>`;
        }
        return `<div class="result-item skip"><span class="status">미채점 · ${q.id}번</span><div class="detail">내 답: ${formatValue(grade.user)}<br />answers.json에 정답을 채워 주세요.</div></div>`;
      })
      .join("");

    showScreen("result");
  }

  function submitQuiz() {
    const unanswered = questions.filter((q) => !isAnswered(q)).length;
    if (unanswered > 0) {
      const ok = confirm(`아직 ${unanswered}문항이 비어 있습니다. 그대로 제출할까요?`);
      if (!ok) return;
    }
    showResult();
  }

  function renderHome() {
    els.quizList.innerHTML = quizCatalog
      .map(
        (quiz) => `
      <button type="button" class="quiz-card" data-quiz-id="${quiz.id}">
        <strong>${quiz.title}</strong>
        <span>${quiz.subtitle || ""}</span>
        <em>${quiz.description || ""}</em>
      </button>
    `
      )
      .join("");

    els.quizList.querySelectorAll(".quiz-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-quiz-id");
        openQuiz(id);
      });
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
      questions = qData.questions || [];
      answerKey = { ...aData };
      delete answerKey._설명;

      els.startEyebrow.textContent = qData.subtitle || meta.subtitle || "";
      els.startTitle.innerHTML = (qData.title || meta.title).replace(/\n/g, "<br />");
      els.startDesc.textContent = `${meta.description || "한 화면에 한 문제씩"} · 총 ${questions.length}문항`;

      const saved = loadState();
      if (saved && saved.name) {
        state = {
          name: saved.name,
          index: Number.isInteger(saved.index) ? saved.index : 0,
          answers: saved.answers || {},
        };
        els.nameInput.value = saved.name;
        els.btnResume.classList.remove("hidden");
      } else {
        state = { name: "", index: 0, answers: {} };
        els.nameInput.value = "";
        els.btnResume.classList.add("hidden");
      }

      showScreen("start");
      els.nameInput.focus();
    } catch (err) {
      console.error(err);
      alert("문제 데이터를 불러오지 못했습니다. 로컬 서버로 열어 주세요.");
    }
  }

  async function init() {
    try {
      const res = await fetch("data/quizzes.json");
      if (!res.ok) throw new Error("catalog");
      quizCatalog = await res.json();
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
    els.btnPrev.addEventListener("click", () => goTo(state.index - 1));
    els.btnNext.addEventListener("click", () => goNext());
    els.btnCheck.addEventListener("click", () => checkCurrentAnswer());
    els.btnRestart.addEventListener("click", () => {
      clearState();
      state = { name: "", index: 0, answers: {} };
      els.nameInput.value = "";
      els.btnResume.classList.add("hidden");
      showScreen("start");
    });

    els.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") startQuiz(false);
    });
  }

  init();
})();
