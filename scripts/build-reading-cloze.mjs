import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'data/reading-cloze');
const source = JSON.parse(fs.readFileSync(path.join(directory, 'source.json'), 'utf8'));
const questions = [];
const answers = {};

for (const unit of source.units) {
  unit.sentences.forEach((row, index) => {
    const words = [];
    const template = row.marked.replace(/\[\[([^\]]+)\]\]/g, (_, phrase) => {
      return phrase.split(/(\s+)/).map(word => {
        if (/^\s+$/.test(word)) return word;
        if (!word || !/^[A-Za-z]+(?:[’'][A-Za-z]+)*(?:-[A-Za-z]+)*$/.test(word)) {
          throw new Error(`Invalid blank word in Lesson ${unit.lesson}: ${word}`);
        }
        const number = words.length;
        words.push(word);
        return `{{${number}}}`;
      }).join('');
    });
    if (!words.length || !row.translation || !row.explanation || /\[\[|\]\]/.test(template)) {
      throw new Error(`Incomplete sentence in Lesson ${unit.lesson}, row ${index + 1}`);
    }
    const id = `l${unit.lesson}-s${String(index + 1).padStart(2, '0')}`;
    questions.push({
      id,
      type: 'cloze',
      section: `Lesson ${unit.lesson} · 본문 빈칸`,
      sentenceNumber: index + 1,
      prompt: '본문에 나온 단어로 빈칸을 채워 보세요.',
      template,
      sentence: row.marked.replace(/\[\[([^\]]+)\]\]/g, '$1'),
      blankCount: words.length,
      translation: row.translation,
      explanation: row.explanation,
      ...(row.context ? { context: row.context } : {}),
      source: {
        file: unit.file,
        lesson: unit.lesson,
        pdfPage: row.pdfPage,
        printedPage: unit.printedPages[row.pdfPage - 1],
        numbers: row.numbers,
      },
    });
    answers[id] = words;
  });
}

for (const [filename, value] of Object.entries({
  'questions.json': { title: source.title, subtitle: 'Lesson 5·7·8 · 문장별 본문 학습', questions },
  'answers.json': answers,
})) {
  fs.writeFileSync(path.join(directory, filename), JSON.stringify(value, null, 2) + '\n');
}
console.log(`Built ${questions.length} sentences, ${questions.reduce((n, q) => n + q.blankCount, 0)} blanks.`);
