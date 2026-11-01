const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const storageKey = 'chaeknamu-cbt-v1:reading-cloze';

test('compact library filters subjects, searches lessons, resets empty results, and opens a quiz', async () => {
  const app = await boot();
  try {
    assert.equal(app.d.title, '호호 스터디');
    assert.equal(app.d.querySelectorAll('.quiz-row').length, 4);
    app.click('[data-subject="영어"]');
    assert.equal(app.d.querySelectorAll('.quiz-row').length, 2);
    assert.equal(app.d.querySelector('[data-subject="영어"]').getAttribute('aria-pressed'), 'true');
    app.type('#quiz-search', 'Lesson 8');
    assert.equal(app.d.querySelectorAll('.quiz-row').length, 2);
    app.type('#quiz-search', '본문');
    assert.equal(app.d.querySelectorAll('.quiz-row').length, 1);
    assert.equal(app.d.querySelector('.quiz-row').dataset.quizId, 'reading-cloze');
    app.type('#quiz-search', '없는 학습');
    assert.equal(app.d.querySelectorAll('.quiz-row').length, 0);
    app.click('#btn-reset-library');
    assert.equal(app.d.querySelectorAll('.quiz-row').length, 4);
    assert.equal(app.d.activeElement.id, 'quiz-search');
    await app.open();
    assert(app.d.getElementById('screen-start').classList.contains('active'));
  } finally { app.dom.window.close(); }
});

test('catalog counts and branded install icons agree with the packaged data', () => {
  const catalog = JSON.parse(read('data/quizzes.json'));
  for (const quiz of catalog.quizzes || catalog) {
    assert.equal(quiz.questionCount, JSON.parse(read(quiz.questionsUrl)).questions.length, quiz.id);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, '호호 스터디');
  for (const icon of manifest.icons) assert(fs.existsSync(path.join(root, icon.src)));
  assert(read('android/app/src/main/res/values/strings.xml').includes('호호 스터디'));
});

async function flush() { await new Promise(resolve => setImmediate(resolve)); }
async function boot(saved, storage = {}) {
  const dom = new JSDOM(read('index.html'), { url: 'https://booktree.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const alerts = [], confirms = [];
  w.requestAnimationFrame = callback => { callback(); return 1; };
  w.alert = message => alerts.push(message);
  w.confirm = message => { confirms.push(message); return true; };
  w.fetch = async url => ({ ok: true, json: async () => JSON.parse(read(url)) });
  w.Math.random = () => 0;
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
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

test('one name is reused across exams, reloads, resumes, and restarting after a result', async () => {
  const app = await boot();
  let storage;
  try {
    await app.open();
    assert(!app.d.getElementById('name-field').classList.contains('hidden'));
    app.type('#name-input','  민수  ');
    app.click('#btn-start');
    assert.equal(app.d.getElementById('quiz-name').textContent,'민수');
    await app.open('english-lessons');
    assert(app.d.getElementById('name-field').classList.contains('hidden'));
    app.click('#btn-start');
    assert.equal(app.d.getElementById('quiz-name').textContent,'민수');
    app.click('#btn-restart');
    assert(app.d.getElementById('name-field').classList.contains('hidden'));
    app.click('#btn-start');
    storage = Object.fromEntries(Object.keys(app.w.localStorage).map(key => [key,app.w.localStorage.getItem(key)]));
  } finally { app.dom.window.close(); }
  const next = await boot(undefined, storage);
  try {
    assert.equal(next.d.getElementById('profile-name').textContent,'민수 님');
    next.click('#btn-edit-name');
    next.type('#profile-name-input','지우');
    next.d.getElementById('profile-editor').dispatchEvent(new next.w.Event('submit',{bubbles:true,cancelable:true}));
    await next.open();
    next.click('#btn-resume');
    assert.equal(next.d.getElementById('quiz-name').textContent,'지우');
    assert.equal(JSON.parse(next.saved()).name,'지우');
    assert.equal(JSON.parse(next.w.localStorage.getItem('hoho-study:profile')).name,'지우');
  } finally { next.dom.window.close(); }
});

test('upgrade imports the latest existing quiz name without changing saved answers', async () => {
  const old = JSON.stringify({name:'기존 이름',updatedAt:1,answers:{'l5-s01':['Last']}});
  const app = await boot(old, {'chaeknamu-cbt-v1:dictionary':JSON.stringify({name:'최근 이름',updatedAt:2})});
  try {
    assert.equal(app.d.getElementById('profile-name').textContent,'최근 이름 님');
    assert.equal(app.saved(),old);
    await app.open();
    assert(app.d.getElementById('name-field').classList.contains('hidden'));
  } finally { app.dom.window.close(); }
});

test('translation, partial grading, reset, complete score, and Enter navigation work together', async () => {
  const app = await boot();
  try {
    await app.start();
    assert.equal(app.d.getElementById('progress-label').textContent, '1 / 25');
    assert.equal(app.d.querySelector('.q-card').dataset.id, 'l5-s01');
    assert(app.d.querySelector('.translation-panel').classList.contains('hidden'));
    app.click('.translation-toggle');
    assert(!app.d.querySelector('.translation-panel').classList.contains('hidden'));
    app.type('[data-blank-index="0"]', 'LAST');
    app.click('#btn-check');
    assert(app.d.getElementById('check-feedback').textContent.includes('1/5점'));
    assert.equal(app.d.querySelectorAll('.cloze-input.mark-correct').length, 1);
    assert.equal(app.d.querySelectorAll('.cloze-input.mark-wrong').length, 4);
    for (const [i, word] of ['Last','threw','at','in','in'].entries()) app.type(`[data-blank-index="${i}"]`, word);
    assert(app.d.querySelector('.cloze-review').classList.contains('hidden'));
    assert(!app.d.querySelector('.translation-panel').classList.contains('hidden'));
    app.enter('[data-blank-index="0"]');
    assert.equal(app.d.activeElement.dataset.blankIndex, '1');
    app.enter('[data-blank-index="4"]');
    assert(app.d.getElementById('check-feedback').textContent.includes('5/5점'));
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
    app.type('[data-blank-index="0"]', 'Last');
    for (const [i, word] of ['Last','threw','at','in','in'].entries()) app.type(`[data-blank-index="${i}"]`, word);
    app.click('#btn-next');
    app.type('[data-blank-index="0"]', 'There');
    app.type('[data-blank-index="1"]', 'eyewitness');
    for (let i = 0; i < 23; i++) app.click('#btn-next');
    app.click('#btn-next');
    assert(app.confirms[0].includes('23문항'));
    const summary = app.d.getElementById('result-summary').textContent;
    const questions = JSON.parse(read('data/reading-cloze/questions.json')).questions.filter(q => q.source.lesson === 5);
    const total = questions.reduce((sum, q) => sum + q.blankCount, 0);
    assert(summary.includes(`빈칸 6/${total}점`), summary);
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
  assert.equal(state.order.length, 37);
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

test('Lesson 6 is selectable, and starting with no lessons preserves the start screen', async () => {
  const app = await boot();
  try {
    await app.open();
    assert.equal(app.d.querySelector('input[name="lesson"][value="6"]').disabled, false);
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

test('new workbook Lesson 6 starts and changed blank layouts reject old saved answers', async () => {
  const legacy = JSON.stringify({name:'이전 학습',answers:{'l5-s01':['threw','at']},index:0,lessons:[5]});
  const app = await boot(legacy);
  try {
    await app.open();
    assert(app.d.getElementById('btn-resume').classList.contains('hidden'));
    await app.start([6]);
    assert.equal(app.d.getElementById('progress-label').textContent,'1 / 23');
    assert.equal(app.d.querySelectorAll('.cloze-input').length,6);
    assert.equal(JSON.parse(app.saved()).revision,'workbook-2026-11-01');
  } finally { app.dom.window.close(); }
});
