const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const storageKey = 'chaeknamu-cbt-v1:reading-cloze';

async function flush() { await new Promise(resolve => setImmediate(resolve)); }
async function boot(saved) {
  const dom = new JSDOM(read('index.html'), { url: 'https://booktree.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const alerts = [], confirms = [];
  w.requestAnimationFrame = callback => { callback(); return 1; };
  w.alert = message => alerts.push(message);
  w.confirm = message => { confirms.push(message); return true; };
  w.fetch = async url => ({ ok: true, json: async () => JSON.parse(read(url)) });
  w.Math.random = () => 0;
  if (saved) w.localStorage.setItem(storageKey, saved);
  for (const file of ['js/cloze.js','js/render.js','js/app.js']) w.eval(read(file));
  await flush();
  const d = w.document;
  const click = selector => { const node = d.querySelector(selector); assert(node, selector); node.click(); };
  const type = (selector, value) => {
    const input = d.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  const enter = selector => d.querySelector(selector).dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const open = async (id = 'reading-cloze') => { click(`[data-quiz-id="${id}"]`); await flush(); };
  const chooseLessons = lessons => {
    for (const input of d.querySelectorAll('input[name="lesson"]')) input.checked = !input.disabled && lessons.includes(Number(input.value));
    d.getElementById('lesson-options').dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const start = async (lessons = [5], mode = 'source', id) => {
    await open(id);
    chooseLessons(lessons);
    for (const input of d.querySelectorAll('input[name="question-order"]')) input.checked = input.value === mode;
    type('#name-input', '시험 확인');
    click('#btn-start');
  };
  return { dom, w, d, alerts, confirms, click, type, enter, open, chooseLessons, start,
    saved: () => w.localStorage.getItem(storageKey) };
}

test('translation, partial grading, reset, complete score, and Enter navigation work together', async () => {
  const app = await boot();
  try {
    await app.start();
    assert.equal(app.d.getElementById('progress-label').textContent, '1 / 25');
    assert.equal(app.d.querySelector('.q-card').dataset.id, 'l5-s01');
    assert(app.d.querySelector('.translation-panel').classList.contains('hidden'));
    app.click('.translation-toggle');
    assert(!app.d.querySelector('.translation-panel').classList.contains('hidden'));
    app.type('[data-blank-index="0"]', 'THREW');
    app.click('#btn-check');
    assert(app.d.getElementById('check-feedback').textContent.includes('1/2점'));
    assert.equal(app.d.querySelectorAll('.cloze-input.mark-correct').length, 1);
    assert.equal(app.d.querySelectorAll('.cloze-input.mark-wrong').length, 1);
    app.type('[data-blank-index="1"]', 'at');
    assert(app.d.querySelector('.cloze-review').classList.contains('hidden'));
    assert(!app.d.querySelector('.translation-panel').classList.contains('hidden'));
    app.enter('[data-blank-index="0"]');
    assert.equal(app.d.activeElement.dataset.blankIndex, '1');
    app.enter('[data-blank-index="1"]');
    assert(app.d.getElementById('check-feedback').textContent.includes('2/2점'));
    assert.equal(app.d.getElementById('progress-label').textContent, '1 / 25');
  } finally { app.dom.window.close(); }
});

test('resume restores partial arrays, lesson subset, position, and saved order despite changed controls', async () => {
  const app = await boot();
  await app.start();
  app.click('#btn-next');
  app.type('[data-blank-index="0"]', 'There');
  const saved = app.saved();
  app.dom.window.close();
  const next = await boot(saved);
  try {
    await next.open();
    assert.equal(next.d.querySelector('input[name="lesson"][value="5"]').checked, true);
    assert.equal(next.d.querySelector('input[name="lesson"][value="7"]').checked, false);
    next.chooseLessons([8]);
    next.click('input[name="question-order"][value="random"]');
    next.click('#btn-resume');
    assert.equal(next.d.getElementById('progress-label').textContent, '2 / 25');
    assert.equal(next.d.querySelector('.q-card').dataset.id, 'l5-s02');
    assert.equal(next.d.querySelector('[data-blank-index="0"]').value, 'There');
    assert.equal(next.d.querySelector('[data-blank-index="1"]').value, '');
    const state = JSON.parse(next.saved());
    assert.deepEqual(state.lessons, [5]);
    assert.equal(state.orderMode, 'source');
  } finally { next.dom.window.close(); }
});

test('submission sums blank points and distinguishes partial, correct, wrong, and incomplete sentences', async () => {
  const app = await boot();
  try {
    await app.start();
    app.type('[data-blank-index="0"]', 'threw');
    app.type('[data-blank-index="1"]', 'at');
    app.click('#btn-next');
    app.type('[data-blank-index="0"]', 'There');
    app.type('[data-blank-index="1"]', 'was');
    app.type('[data-blank-index="2"]', 'eyewitnesses');
    for (let i = 0; i < 23; i++) app.click('#btn-next');
    app.click('#btn-next');
    assert(app.confirms[0].includes('23문항'));
    const summary = app.d.getElementById('result-summary').textContent;
    const questions = JSON.parse(read('data/reading-cloze/questions.json')).questions.filter(q => q.source.lesson === 5);
    const total = questions.reduce((sum, q) => sum + q.blankCount, 0);
    assert(summary.includes(`빈칸 4/${total}점`), summary);
    assert(summary.includes('문장 정답 1/25 (부분 정답 1, 오답 23)'), summary);
    assert.equal(app.d.querySelectorAll('.result-item.partial').length, 1);
    assert.equal(app.d.querySelectorAll('.result-item').length, 25);
  } finally { app.dom.window.close(); }
});

test('random order stays within selected lesson and restores the exact shuffled order', async () => {
  const app = await boot();
  await app.start([8], 'random');
  const saved = app.saved();
  const state = JSON.parse(saved);
  const source = JSON.parse(read('data/reading-cloze/questions.json')).questions.filter(q => q.source.lesson === 8).map(q => q.id);
  assert.equal(state.order.length, 41);
  assert(state.order.every(id => id.startsWith('l8-')));
  assert.notDeepEqual(state.order, source);
  const firstId = app.d.querySelector('.q-card').dataset.id;
  app.dom.window.close();
  const next = await boot(saved);
  try {
    await next.open();
    next.click('#btn-resume');
    assert.equal(next.d.querySelector('.q-card').dataset.id, firstId);
    assert.deepEqual(JSON.parse(next.saved()).order, state.order);
    assert.equal(JSON.parse(next.saved()).orderMode, 'random');
  } finally { next.dom.window.close(); }
});

test('missing Lesson 6 is disabled, and starting with no lessons preserves the start screen', async () => {
  const app = await boot();
  try {
    await app.open();
    assert.equal(app.d.querySelector('input[name="lesson"][value="6"]').disabled, true);
    app.chooseLessons([]);
    app.type('#name-input', '시험 확인');
    app.click('#btn-start');
    assert(app.alerts[0].includes('하나 이상'));
    assert(app.d.getElementById('screen-start').classList.contains('active'));
    assert.equal(app.saved(), null);
  } finally { app.dom.window.close(); }
});

test('existing vocabulary quiz still filters Lesson 6 and uses random order without the new selector', async () => {
  const app = await boot();
  try {
    await app.start([6], 'source', 'english-lessons');
    assert.equal(app.d.getElementById('progress-label').textContent, '1 / 24');
    assert(app.d.getElementById('order-picker').classList.contains('hidden'));
    assert(app.d.querySelector('.q-section').textContent.includes('Lesson 6'));
    assert.equal(JSON.parse(app.w.localStorage.getItem('chaeknamu-cbt-v1:english-lessons')).orderMode, 'random');
  } finally { app.dom.window.close(); }
});
