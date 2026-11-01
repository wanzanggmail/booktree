const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const cloze = require('../js/cloze.js');
const questions = read('data/reading-cloze/questions.json').questions;
const keys = read('data/reading-cloze/answers.json');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/render.js'), 'utf8'), context);
const render = context.window.CBTRender.render;

test('all authored sentences reconstruct exactly and have complete bilingual data', () => {
  assert.equal(questions.length, 94);
  assert.equal(new Set(questions.map(q => q.id)).size, 94);
  assert.equal(Object.keys(keys).length, 94);
  assert.equal(questions.reduce((sum, q) => sum + q.blankCount, 0), 247);
  for (const q of questions) {
    assert(q.translation && q.explanation);
    assert.equal(keys[q.id].length, q.blankCount);
    assert.equal(q.template.replace(/\{\{(\d+)\}\}/g, (_, index) => keys[q.id][index]), q.sentence);
    assert.equal(cloze.grade(q, keys[q.id], keys[q.id]).earned, q.blankCount);
  }
});

test('sentence coverage follows actual sentences, including splits and merged quotation', () => {
  for (const [lesson, numberCount, sentenceCount] of [[5,25,25],[7,26,28],[8,40,41]]) {
    const group = questions.filter(q => q.source.lesson === lesson);
    assert.equal(group.length, sentenceCount);
    for (let number = 1; number <= numberCount; number++) {
      assert(group.some(q => q.source.numbers.includes(number)), `Missing Lesson ${lesson} source ${number}`);
    }
  }
  const from = (lesson, number) => questions.filter(q => q.source.lesson === lesson && q.source.numbers.includes(number));
  assert.equal(from(7,13).length, 2);
  assert.equal(from(7,24).length, 2);
  assert.equal(from(8,6).length, 2);
  assert.equal(from(8,27).length, 2);
  assert.deepEqual(from(8,34)[0].source.numbers, [34,35]);
  assert.equal(from(8,34)[0], from(8,35)[0]);
  assert.equal(from(6,1).length, 0);
});

test('grading awards points per position and treats unfinished answers as incomplete', () => {
  const q = { blankCount: 3 };
  const key = ['in','front','of'];
  const grade = cloze.grade(q, ['IN', 'back', ''], key);
  assert.equal(grade.status, 'partial');
  assert.equal(grade.earned, 1);
  assert.equal(grade.total, 3);
  assert.deepEqual(grade.slots.map(s => s.ok), [true,false,false]);
  assert.equal(cloze.isComplete(q, ['in','front','']), false);
  assert.equal(cloze.isComplete(q, key), true);
  assert.equal(cloze.hasAny(['','','']), false);
  assert.equal(cloze.hasAny(['','a','']), true);
  assert.equal(cloze.grade(q, [], key).earned, 0);
  assert.equal(cloze.grade(q, ['of','front','in'], key).earned, 1);
});

test('normalization accepts typography and case but preserves grammar and original forms', () => {
  const q = { blankCount: 1 };
  assert.equal(cloze.grade(q, ["  COULDN'T  "], ['couldn’t']).status, 'correct');
  assert.equal(cloze.grade(q, ['throw'], ['threw']).status, 'wrong');
  assert.equal(cloze.grade(q, ['eyewitness'], ['eyewitnesses']).status, 'wrong');
  assert.equal(cloze.grade(q, ['I am'], ['I’m']).status, 'wrong');
  assert.equal(cloze.grade(q, ['x'], []).status, 'ungraded');
});

test('initial render exposes only masked text and a hidden translation, never review answers', () => {
  for (const q of questions) {
    const html = render(q, []);
    assert.equal((html.match(/data-blank-index=/g) || []).length, q.blankCount);
    assert(html.includes('translation-panel hidden'));
    assert(html.includes('cloze-review hidden"></div>'));
    assert(!html.includes(q.sentence));
    assert(!html.includes(q.explanation));
    assert(!/translation-toggle[^>]*disabled/.test(html));
  }
  const html = render(questions[0], ['"><img src=x onerror=alert(1)>']);
  assert(!html.includes('<img'));
  assert(html.includes('&lt;img'));
});

test('catalog enables only supplied lessons, and all legacy question renderers still work', () => {
  const catalog = read('data/quizzes.json');
  const meta = catalog.find(q => q.id === 'reading-cloze');
  assert.deepEqual(meta.lessons, [5,7,8]);
  assert.deepEqual(meta.pendingLessons, [6]);
  assert.equal(meta.defaultOrder, 'source');
  let count = 0;
  for (const quiz of catalog.filter(q => q.id !== 'reading-cloze')) {
    for (const q of read(quiz.questionsUrl).questions) {
      const html = render(q, '');
      assert(!html.includes('translation-toggle'));
      assert(!html.includes('cloze-input'));
      count++;
    }
  }
  assert.equal(count, 412);
});
