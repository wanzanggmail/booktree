window.CBTRender = (function () {
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function allowEm(str) {
    return escapeHtml(str).replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>");
  }

  function shell(q, bodyHtml) {
    return `
      <article class="q-card" data-id="${escapeHtml(q.id)}" data-type="${escapeHtml(q.type)}">
        <p class="q-section">${escapeHtml(q.section || "")}</p>
        <p class="q-num">문제 ${escapeHtml(q.id)}</p>
        <p class="q-prompt">${escapeHtml(q.prompt || "")}</p>
        ${bodyHtml}
      </article>
    `;
  }

  function renderHint(hint) {
    if (!hint) return "";
    const chars = Array.from(String(hint).replace(/\s+/g, ""));
    if (chars.length <= 2) {
      return `<p class="q-hint" aria-label="초성 힌트">${escapeHtml(hint)}</p>`;
    }
    const boxes = chars
      .map((ch) => `<span class="hint-box">${escapeHtml(ch)}</span>`)
      .join("");
    return `<div class="q-hint-boxes" aria-label="초성 힌트">${boxes}</div>`;
  }

  function renderText(q, value) {
    const example = q.example
      ? `<p class="q-example">${allowEm(q.example)}</p>`
      : "";
    return shell(
      q,
      `
      ${example}
      ${renderHint(q.hint)}
      <input
        class="answer-input"
        type="text"
        inputmode="text"
        autocomplete="off"
        enterkeyhint="done"
        placeholder="${escapeHtml(q.placeholder || "답을 입력하세요")}"
        value="${escapeHtml(value || "")}"
      />
      `
    );
  }

  function renderChoiceLike(q, value, variant) {
    const example = q.example
      ? `<p class="q-example">${allowEm(q.example)}</p>`
      : "";
    const left = q.left
      ? `<p class="q-left">${escapeHtml(q.left)}</p>`
      : "";
    const options = (q.options || [])
      .map((opt) => {
        const selected = value === opt ? "selected" : "";
        return `<button type="button" class="opt-btn ${selected}" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
      })
      .join("");

    return shell(
      q,
      `
      ${left}
      ${example}
      <div class="options ${variant || ""}" role="listbox">${options}</div>
      `
    );
  }

  function renderOx(q, value) {
    const example = q.example
      ? `<p class="q-example">${allowEm(q.example)}</p>`
      : "";
    const buttons = (q.options || ["○", "△"])
      .map((opt) => {
        const selected = value === opt ? "selected" : "";
        return `<button type="button" class="ox-btn ${selected}" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`;
      })
      .join("");
    return shell(
      q,
      `
      ${example}
      <div class="ox-options">${buttons}</div>
      `
    );
  }

  function renderMulti(q, value) {
    const selected = Array.isArray(value) ? value : [];
    const dialogue = (q.dialogue || [])
      .map(
        (line) =>
          `<div class="dialogue-item"><strong>${escapeHtml(line.speaker)}</strong> ${escapeHtml(line.text)}</div>`
      )
      .join("");
    const options = (q.options || [])
      .map((opt) => {
        const checked = selected.includes(opt);
        return `
          <label class="multi-opt ${checked ? "selected" : ""}">
            <input type="checkbox" value="${escapeHtml(opt)}" ${checked ? "checked" : ""} />
            <span>${escapeHtml(opt)}</span>
          </label>
        `;
      })
      .join("");
    return shell(
      q,
      `
      <div class="dialogue">${dialogue}</div>
      <div class="multi-options">${options}</div>
      `
    );
  }

  function renderEssay(q, value) {
    const definition = q.definition
      ? `<p class="q-definition">${escapeHtml(q.definition)}</p>`
      : "";
    return shell(
      q,
      `
      ${definition}
      <textarea
        class="essay-input"
        placeholder="${escapeHtml(q.placeholder || "예문을 작성하세요")}"
      >${escapeHtml(value || "")}</textarea>
      `
    );
  }

  function render(q, value) {
    switch (q.type) {
      case "text":
        return renderText(q, value);
      case "choice":
      case "choice_pool":
      case "match":
        return renderChoiceLike(q, value);
      case "ox":
        return renderOx(q, value);
      case "multi":
        return renderMulti(q, value);
      case "essay":
        return renderEssay(q, value);
      default:
        return shell(q, `<p>지원하지 않는 유형: ${escapeHtml(q.type)}</p>`);
    }
  }

  function bind(root, q, onChange, hooks) {
    if (!root || !q) return;
    const onEnter = hooks && typeof hooks.onEnter === "function" ? hooks.onEnter : null;

    if (q.type === "text") {
      const input = root.querySelector(".answer-input");
      if (input) {
        input.addEventListener("input", () => onChange(input.value));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onChange(input.value);
            if (onEnter) onEnter();
          }
        });
      }
      return;
    }

    if (q.type === "essay") {
      const area = root.querySelector(".essay-input");
      if (area) {
        area.addEventListener("input", () => onChange(area.value));
      }
      return;
    }

    if (q.type === "multi") {
      root.querySelectorAll(".multi-opt input").forEach((input) => {
        input.addEventListener("change", () => {
          const values = Array.from(root.querySelectorAll(".multi-opt input:checked")).map(
            (el) => el.value
          );
          root.querySelectorAll(".multi-opt").forEach((label) => {
            label.classList.toggle("selected", label.querySelector("input").checked);
          });
          onChange(values);
        });
      });
      return;
    }

    root.querySelectorAll("[data-value]").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll("[data-value]").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
        onChange(btn.getAttribute("data-value"));
      });
    });
  }

  return { render, bind };
})();
