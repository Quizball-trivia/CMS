/**
 * The question upload's .txt files: the Quizball CMS's numbered format
 * (src/lib/parsers/question-parser.ts), with the lines each Table Derby game
 * mode stores. A file holds one mode's questions, each opened by its number
 * ("1."); the lines under it are read by label ("Answer:", "Points:", …).
 *
 * The parser knows nothing of the dialog's choices (the category, the puzzle,
 * the clubs on file): a parsed question becomes an import item with
 * `toTdImportItem`, once those are known. Its ID is made up from what the row
 * says (see import-format.ts), so reading a file twice names its rows alike.
 */
import { t } from '@/lib/td/i18n';
import { canonicalJson } from './hash';
import { madeKey, toItem } from './import-format';

export type TdUploadType = 'cards' | 'whoami-subjects' | 'box-questions' | 'penalty-questions' | 'practice-questions' | 'football-logic' | 'put-in-order' | 'career-path';

export const TD_UPLOAD_TYPES: readonly TdUploadType[] = ['cards', 'whoami-subjects', 'box-questions', 'penalty-questions', 'practice-questions', 'football-logic', 'put-in-order', 'career-path'];

/** The files' keywords stay as the Quizball CMS's .txt files have them; what they say is Georgian. */
export const TD_UPLOAD_EXAMPLES: Record<TdUploadType, string> = {
  cards: `1.
Clue 1: დავიბადე არგენტინაში 1987 წელს
Clue 2: ბარსელონაში 21 წელი გავატარე
Clue 3: 2022 წელს მსოფლიო ჩემპიონი გავხდი
Answer: ლიონელ მესი | Lionel Messi
Points: 1
Photo: 158023 | 24

2.
Clue 1: იტალიელი მეკარე
Clue 2: 2006 წლის მსოფლიო ჩემპიონი
Answer: ბუფონი | Buffon
Points: 2
Image: buffon.jpg`,
  'whoami-subjects': `1.
Clue 1: დაცვაში ვთამაშობდი
Clue 2: ჩემი კარიერა თბილისის „დინამოში“ დაიწყო
Clue 3: 2001 წელს მილანში გადავედი
Clue 4: ჩემპიონთა ლიგა ორჯერ მოვიგე
Clue 5: მოგვიანებით თბილისის მერი გავხდი
Answer: კახა კალაძე | კალაძე | Kakha Kaladze`,
  'box-questions': `1. ვინ გახდა 2022 წლის მსოფლიო ჩემპიონატის საუკეთესო ბომბარდირი?
Answer: კილიან ემბაპე | ემბაპე | Kylian Mbappé | Mbappe`,
  'penalty-questions': `1. რომელი ქვეყნის ნაკრებმა მოიგო ევრო 2024?
Answer: ესპანეთი | Spain`,
  'practice-questions': `1. რომელმა ქვეყანამ მოიგო მსოფლიო ჩემპიონატი 2014 წელს?
A) ბრაზილია
B) გერმანია*
C) არგენტინა
D) ესპანეთი
Difficulty: Easy
Explanation: ფინალში გერმანიამ არგენტინა დამატებით დროში 1:0 დაამარცხა.`,
  'football-logic': `1. Prompt: დაასახელეთ მოთამაშე ვიზუალური ლოგიკით
Image A: https://example.com/stopwatch-9-minutes.png
Image B: /assets/football-logic/five-fingers.png
Answer: რობერტ ლევანდოვსკი | ლევანდოვსკი | Robert Lewandowski | Lewandowski`,
  'put-in-order': `1. დაალაგეთ მსოფლიო ჩემპიონატის მასპინძლები ადრიდან გვიანდელისკენ
Items:
- რუსეთი 2018
- გერმანია 2006
- სამხრეთ აფრიკა 2010
- ბრაზილია 2014
Answer:
1. გერმანია 2006
2. სამხრეთ აფრიკა 2010
3. ბრაზილია 2014
4. რუსეთი 2018`,
  'career-path': `1. Question: Dinamo Tbilisi ➔ Rubin Kazan ➔ Napoli ➔ Paris Saint-Germain
Answer: ხვიჩა კვარაცხელია | კვარაცხელია | Khvicha Kvaratskhelia`,
};

export interface TdParseError {
  lineNumber: number;
  questionNumber?: number;
  message: string;
  severity: 'error' | 'warning';
}

interface ParsedBase {
  questionNumber: number;
  lineNumber: number;
}

export interface ParsedCard extends ParsedBase {
  kind: 'cards';
  clues: string[];
  display: string;
  aliases: string[];
  points: 1 | 2 | 3;
  imageKey: string | null;
  /** A picture chosen with the file, by its file name: uploaded with the questions. */
  imageFile: string | null;
  photo: { id: number; ver: string } | null;
}

export interface ParsedWhoami extends ParsedBase {
  kind: 'whoami-subjects';
  clues: string[];
  display: string;
  aliases: string[];
}

export interface ParsedQa extends ParsedBase {
  kind: 'box-questions' | 'penalty-questions';
  q: string;
  display: string;
  aliases: string[];
}

export interface ParsedPractice extends ParsedBase {
  kind: 'practice-questions';
  prompt: string;
  options: Array<{ letter: string; text: string; isCorrect: boolean }>;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string | null;
  imageKey: string | null;
  imageFile: string | null;
}

export interface ParsedFootballLogic extends ParsedBase {
  kind: 'football-logic';
  prompt: string;
  imageA: string | null;
  imageB: string | null;
  display: string;
  aliases: string[];
}

export interface ParsedPutInOrder extends ParsedBase {
  kind: 'put-in-order';
  prompt: string;
  /** In the order shown. */
  items: string[];
  /** The same labels in the right order. */
  order: string[];
}

export interface ParsedCareerPath extends ParsedBase {
  kind: 'career-path';
  /** null: the game's usual question. */
  prompt: string | null;
  clubs: string[];
  display: string;
  aliases: string[];
}

export type TdParsedQuestion = ParsedCard | ParsedWhoami | ParsedQa | ParsedPractice | ParsedFootballLogic | ParsedPutInOrder | ParsedCareerPath;

export interface TdParseResult {
  questions: TdParsedQuestion[];
  errors: TdParseError[];
}

/* ── lines and blocks ──────────────────────────────────────────────── */

interface Line {
  text: string;
  line: number;
}

interface Block {
  questionNumber: number;
  lineNumber: number;
  lines: Line[];
  /** Put in Order only: where the block is, to tell its answer list from the next question. */
  section: 'items' | 'answer' | null;
  items: number;
  answers: number;
}

const QUESTION_START = /^(\d+)\.\s*(.*)$/;
const CLUE_LINE = /^Clue\s+(\d+)\s*:\s*(.*)$/i;
const OPTION_LINE = /^([A-H])\)\s+(.+?)(\*?)$/;
const ARROWS = /(?:➔|->|→)/;
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IMAGE_PATTERN = /^(?:https?:\/\/|\/)\S{1,2040}$/;
/** Quizball's lines that no Table Derby mode of that kind stores. */
const UNUSED_LINE = /^(?:Difficulty|Explanation|Direction)\s*:/i;
const LETTERS = 'ABCDEFGH';

function labelled(text: string, name: string): string | null {
  const match = new RegExp(`^${name}\\s*:\\s*(.*)$`, 'i').exec(text);
  return match ? (match[1] ?? '').trim() : null;
}

const withoutQuestionLabel = (text: string) => text.replace(/^Question\s*:\s*/i, '').trim();

function normalizeAlias(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** "Shown | spelling | spelling": the first is shown; every one counts as a spelling. */
function splitAnswer(value: string): { display: string; aliases: string[] } {
  const tokens = value
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean);
  return { display: tokens[0] ?? '', aliases: tokens.filter((token, index) => tokens.indexOf(token) === index) };
}

/** Whether a line opens a new numbered question. A Put in Order answer is itself a numbered list: it ends once it has as many lines as there are items. */
function startsBlock(type: TdUploadType, current: Block | null): boolean {
  if (!current) return true;
  if (type !== 'put-in-order') return true;
  return current.section !== 'answer' || current.answers >= current.items;
}

function addLine(block: Block, text: string, line: number) {
  block.lines.push({ text, line });
  if (/^Items\s*:\s*$/i.test(text)) block.section = 'items';
  else if (/^Answer\s*:\s*$/i.test(text)) block.section = 'answer';
  else if (block.section === 'items' && /^-\s+\S/.test(text)) block.items += 1;
  else if (block.section === 'answer' && /^\d+\.\s+\S/.test(text)) block.answers += 1;
}

function splitIntoBlocks(content: string, type: TdUploadType): { blocks: Block[]; errors: TdParseError[] } {
  const lines = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const errors: TdParseError[] = [];
  const seenNumbers = new Set<number>();
  let lastNumber: number | null = null;
  let current: Block | null = null;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const text = raw.trim();
    const match = text.match(QUESTION_START);

    if (match && startsBlock(type, current)) {
      const questionNumber = Number.parseInt(match[1] ?? '0', 10);
      if (seenNumbers.has(questionNumber)) {
        errors.push({ lineNumber, questionNumber, message: t('Duplicate question number {n}', { n: questionNumber }), severity: 'warning' });
      }
      if (lastNumber !== null && questionNumber !== lastNumber + 1) {
        errors.push({ lineNumber, questionNumber, message: t('Expected question number {expected}, found {n}', { expected: lastNumber + 1, n: questionNumber }), severity: 'warning' });
      }
      seenNumbers.add(questionNumber);
      lastNumber = questionNumber;
      if (current) blocks.push(current);
      current = { questionNumber, lineNumber, lines: [], section: null, items: 0, answers: 0 };
      const tail = (match[2] ?? '').trim();
      if (tail) addLine(current, tail, lineNumber);
      return;
    }

    if (!current) {
      if (text) errors.push({ lineNumber, message: t('Content found before the first numbered question'), severity: 'warning' });
      return;
    }
    if (text) addLine(current, text, lineNumber);
  });

  if (current) blocks.push(current);
  return { blocks, errors };
}

/* ── one question ──────────────────────────────────────────────────── */

interface Reader {
  errors: TdParseError[];
  error(message: string, line?: number): void;
  warn(message: string, line?: number): void;
  failed(): boolean;
}

function reader(block: Block): Reader {
  const errors: TdParseError[] = [];
  const add = (severity: TdParseError['severity'], message: string, line?: number) => errors.push({ lineNumber: line ?? block.lineNumber, questionNumber: block.questionNumber, message, severity });
  return { errors, error: (message, line) => add('error', message, line), warn: (message, line) => add('warning', message, line), failed: () => errors.some((e) => e.severity === 'error') };
}

const missingLine = (label: string) => t('Missing the “{label}” line', { label: `${label}:` });
const emptyLine = (label: string) => t('The “{label}” line is empty', { label: `${label}:` });
const ignored = (r: Reader, { text, line }: Line) => r.warn(t('This line is not part of the format and is ignored: {text}', { text }), line);

/** The labelled lines that may appear once: a second one is a mistake. */
function singles(r: Reader) {
  const found = new Map<string, { value: string; line: number }>();
  return {
    take(name: string, value: string, line: number) {
      if (found.has(name)) r.error(t('More than one “{label}” line', { label: `${name}:` }), line);
      else found.set(name, { value, line });
    },
    get: (name: string) => found.get(name),
  };
}

function answerOf(r: Reader, entry: { value: string; line: number } | undefined): { display: string; aliases: string[] } | null {
  if (!entry) {
    r.error(missingLine('Answer'));
    return null;
  }
  const answer = splitAnswer(entry.value);
  if (!answer.display) {
    r.error(emptyLine('Answer'), entry.line);
    return null;
  }
  return answer;
}

/** A picture file's name, as the Image line gives it. */
const PICTURE_FILE = /\.(?:jpe?g|png|webp)$/i;

/** An Image line: a picture chosen with the file (by its name), or an image already uploaded (by its key). */
function imageLine(r: Reader, entry: { value: string; line: number } | undefined): { imageKey: string | null; imageFile: string | null } {
  if (!entry) return { imageKey: null, imageFile: null };
  if (PICTURE_FILE.test(entry.value)) return { imageKey: null, imageFile: entry.value.trim() };
  if (!KEY_PATTERN.test(entry.value)) {
    r.error(t('An image is the file name of a picture chosen with the file (buffon.jpg), or the key of an image already uploaded'), entry.line);
    return { imageKey: null, imageFile: null };
  }
  return { imageKey: entry.value, imageFile: null };
}

function photoOf(r: Reader, entry: { value: string; line: number } | undefined): { id: number; ver: string } | null {
  if (!entry) return null;
  const match = /^(\d+)\s*\|\s*(\S(?:.{0,18}\S)?)$/.exec(entry.value);
  const id = match ? Number(match[1]) : 0;
  if (!match || id < 1 || id > 2147483647) {
    r.error(t('A photo is a SoFIFA player id and version, such as “158023 | 25_1”'), entry.line);
    return null;
  }
  return { id, ver: match[2]! };
}

type Parsed<K extends TdParsedQuestion> = { question?: K; errors: TdParseError[] };

function parseClues(block: Block, kind: 'cards' | 'whoami-subjects'): Parsed<ParsedCard | ParsedWhoami> {
  const r = reader(block);
  const card = kind === 'cards';
  const max = card ? 8 : 20;
  const once = singles(r);
  const clues: Array<{ number: number; text: string }> = [];

  for (const entry of block.lines) {
    const { text, line } = entry;
    const clue = CLUE_LINE.exec(text);
    if (clue) {
      const body = (clue[2] ?? '').trim();
      if (!body) r.error(emptyLine(`Clue ${clue[1]}`), line);
      clues.push({ number: Number(clue[1]), text: body });
      continue;
    }
    const answer = labelled(text, 'Answer');
    if (answer !== null) {
      once.take('Answer', answer, line);
      continue;
    }
    const extra = card ? (['Points', 'Image', 'Photo'] as const).find((name) => labelled(text, name) !== null) : undefined;
    if (extra) once.take(extra, labelled(text, extra)!, line);
    else ignored(r, entry);
  }

  const { imageKey, imageFile } = imageLine(r, once.get('Image'));
  const photo = photoOf(r, once.get('Photo'));
  // A card may leave its clues out: one already in the category keeps its own (the dialog asks them of a new card).
  if (clues.length === 0 && !card) r.error(t('Needs at least one clue line'));
  if (clues.length > max) r.error(t('At most {max} clue lines', { max }));
  if (clues.some((clue, index) => clue.number !== index + 1)) r.error(t('Clues must be numbered sequentially starting from 1'));
  const answer = answerOf(r, once.get('Answer'));

  let points: 1 | 2 | 3 | null = null;
  if (card) {
    const entry = once.get('Points');
    if (!entry) r.error(t('Missing points (use “Points: 1”, “Points: 2” or “Points: 3”)'));
    else if (/^[123]$/.test(entry.value)) points = Number(entry.value) as 1 | 2 | 3;
    else r.error(t('Points must be 1, 2 or 3'), entry.line);
  }

  if (r.failed() || !answer) return { errors: r.errors };
  const base = { questionNumber: block.questionNumber, lineNumber: block.lineNumber, clues: clues.map((clue) => clue.text), display: answer.display, aliases: answer.aliases };
  return { errors: r.errors, question: card ? { kind: 'cards', ...base, points: points!, imageKey, imageFile, photo } : { kind: 'whoami-subjects', ...base } };
}

function parseQa(block: Block, kind: 'box-questions' | 'penalty-questions'): Parsed<ParsedQa> {
  const r = reader(block);
  const once = singles(r);
  const questions: string[] = [];

  for (const entry of block.lines) {
    const answer = labelled(entry.text, 'Answer');
    if (answer !== null) once.take('Answer', answer, entry.line);
    else if (UNUSED_LINE.test(entry.text)) ignored(r, entry);
    else questions.push(withoutQuestionLabel(entry.text));
  }

  if (questions.length === 0 || !questions[0]) r.error(t('Missing question text'));
  else if (questions.length > 1) r.error(t('Needs exactly one question line before the answer'));
  const answer = answerOf(r, once.get('Answer'));

  if (r.failed() || !answer) return { errors: r.errors };
  return { errors: r.errors, question: { kind, questionNumber: block.questionNumber, lineNumber: block.lineNumber, q: questions[0]!, display: answer.display, aliases: answer.aliases } };
}

function parsePractice(block: Block): Parsed<ParsedPractice> {
  const r = reader(block);
  const once = singles(r);
  const prompts: Line[] = [];
  const options: ParsedPractice['options'] = [];
  const explanation: string[] = [];
  let explaining = false;
  let explained = false;

  for (const entry of block.lines) {
    const { text, line } = entry;
    const difficulty = labelled(text, 'Difficulty');
    if (difficulty !== null) {
      once.take('Difficulty', difficulty, line);
      explaining = false;
      continue;
    }
    const first = labelled(text, 'Explanation');
    if (first !== null) {
      if (explained) r.error(t('More than one “{label}” line', { label: 'Explanation:' }), line);
      explained = true;
      explanation.length = 0;
      explanation.push(first);
      explaining = true;
      continue;
    }
    const image = labelled(text, 'Image');
    if (image !== null) {
      once.take('Image', image, line);
      explaining = false;
      continue;
    }
    // Lines after the explanation belong to it until another labelled line, as in the Quizball CMS.
    if (explaining) {
      explanation.push(text);
      continue;
    }
    const option = OPTION_LINE.exec(text);
    if (option) options.push({ letter: option[1]!, text: (option[2] ?? '').trim(), isCorrect: option[3] === '*' });
    else prompts.push({ text: withoutQuestionLabel(text), line });
  }

  const [prompt, ...extra] = prompts;
  if (!prompt?.text) r.error(t('Missing question text'));
  for (const entry of extra) ignored(r, entry);
  if (options.length < 2 || options.length > 8) r.error(t('Must have between 2 and 8 options (A, B, C…), found {n}', { n: options.length }));
  else if (options.some((option, index) => option.letter !== LETTERS[index])) r.error(t('Options must be lettered A, B, C… in order'));
  const correct = options.filter((option) => option.isCorrect).length;
  if (correct !== 1) r.error(correct === 0 ? t('No correct answer marked (use * after the correct option)') : t('Multiple correct answers marked (only one allowed)'));

  const level = once.get('Difficulty');
  let difficulty: ParsedPractice['difficulty'] | null = null;
  if (!level) r.error(t('Missing difficulty level (use “Difficulty: Easy/Medium/Hard”)'));
  else if (/^(?:easy|medium|hard)$/i.test(level.value)) difficulty = level.value.toLowerCase() as ParsedPractice['difficulty'];
  else r.error(t('Difficulty must be Easy, Medium or Hard'), level.line);
  const { imageKey, imageFile } = imageLine(r, once.get('Image'));

  if (r.failed() || !prompt || !difficulty) return { errors: r.errors };
  return {
    errors: r.errors,
    question: {
      kind: 'practice-questions',
      questionNumber: block.questionNumber,
      lineNumber: block.lineNumber,
      prompt: prompt.text,
      options,
      difficulty,
      explanation: explanation.join(' ').trim() || null,
      imageKey,
      imageFile,
    },
  };
}

function imageOf(r: Reader, entry: { value: string; line: number } | undefined): string | null {
  if (!entry || entry.value === '') return null;
  if (!IMAGE_PATTERN.test(entry.value)) {
    r.error(t('An image is a path starting with / or a web address starting with https://'), entry.line);
    return null;
  }
  if (entry.value.startsWith('http://')) r.warn(t('An http:// image may not show in the game: use https://'), entry.line);
  return entry.value;
}

function parseLogic(block: Block): Parsed<ParsedFootballLogic> {
  const r = reader(block);
  const once = singles(r);
  const unlabelled: Line[] = [];

  for (const entry of block.lines) {
    const { text, line } = entry;
    const found = (['Prompt', 'Image\\s*A', 'Image\\s*B', 'Answer'] as const).find((name) => labelled(text, name) !== null);
    if (found) once.take(found.replace('\\s*', ' '), labelled(text, found)!, line);
    else if (UNUSED_LINE.test(text)) ignored(r, entry);
    else unlabelled.push({ text: withoutQuestionLabel(text), line });
  }

  const labelledPrompt = once.get('Prompt');
  const [first, ...rest] = unlabelled;
  const prompt = labelledPrompt ? labelledPrompt.value : (first?.text ?? '');
  for (const entry of labelledPrompt ? unlabelled : rest) ignored(r, entry);
  const imageA = imageOf(r, once.get('Image A'));
  const imageB = imageOf(r, once.get('Image B'));
  const answer = answerOf(r, once.get('Answer'));

  if (r.failed() || !answer) return { errors: r.errors };
  return { errors: r.errors, question: { kind: 'football-logic', questionNumber: block.questionNumber, lineNumber: block.lineNumber, prompt, imageA, imageB, display: answer.display, aliases: answer.aliases } };
}

function parseOrder(block: Block): Parsed<ParsedPutInOrder> {
  const r = reader(block);
  const prompts: Line[] = [];
  const items: string[] = [];
  const answers: string[] = [];
  let section: Block['section'] = null;
  let sawItems = false;
  let sawAnswer = false;

  for (const entry of block.lines) {
    const { text } = entry;
    if (/^Items\s*:\s*$/i.test(text)) {
      section = 'items';
      sawItems = true;
    } else if (/^Answer\s*:\s*$/i.test(text)) {
      section = 'answer';
      sawAnswer = true;
    } else if (UNUSED_LINE.test(text)) ignored(r, entry);
    else if (section === 'items' || section === 'answer') {
      const match = (section === 'items' ? /^-\s+(.+)$/ : /^\d+\.\s+(.+)$/).exec(text);
      if (match) (section === 'items' ? items : answers).push((match[1] ?? '').trim());
      else ignored(r, entry);
    } else prompts.push({ text: withoutQuestionLabel(text), line: entry.line });
  }

  const [prompt, ...extra] = prompts;
  if (!prompt?.text) r.error(t('Missing question text'));
  for (const entry of extra) ignored(r, entry);
  if (!sawItems) r.error(t('Missing Items section'));
  if (!sawAnswer) r.error(t('Missing Answer section'));

  if (sawItems && sawAnswer) {
    if (items.length < 2 || items.length > 12) r.error(t('Put in Order needs between 2 and 12 items, found {n}', { n: items.length }));
    if (answers.length !== items.length) r.error(t('Answer item count must match item count'));
    const shown = items.map(normalizeAlias);
    if (new Set(shown).size !== shown.length) r.error(t('Items must be different from each other'));
    const ranked = answers.map(normalizeAlias);
    if (new Set(ranked).size !== ranked.length) r.error(t('Each item appears once in the Answer'));
    answers.forEach((answer, index) => {
      if (!shown.includes(ranked[index]!)) r.error(t('Answer item “{item}” does not match any listed item', { item: answer }));
    });
  }

  if (r.failed() || !prompt) return { errors: r.errors };
  return { errors: r.errors, question: { kind: 'put-in-order', questionNumber: block.questionNumber, lineNumber: block.lineNumber, prompt: prompt.text, items, order: answers } };
}

function parseCareer(block: Block): Parsed<ParsedCareerPath> {
  const r = reader(block);
  const once = singles(r);
  const chains: Line[] = [];

  for (const entry of block.lines) {
    const { text, line } = entry;
    const prompt = labelled(text, 'Prompt');
    const answer = labelled(text, 'Answer');
    if (prompt !== null) once.take('Prompt', prompt, line);
    else if (answer !== null) once.take('Answer', answer, line);
    else if (UNUSED_LINE.test(text)) ignored(r, entry);
    else chains.push({ text: withoutQuestionLabel(text), line });
  }

  const [chain, ...extra] = chains;
  for (const entry of extra) ignored(r, entry);
  const clubs = (chain?.text ?? '')
    .split(ARROWS)
    .map((club) => club.trim())
    .filter(Boolean);
  if (clubs.length < 2) r.error(t('Career Path questions need at least 2 clubs separated by arrows'));
  if (clubs.length > 20) r.error(t('At most {max} clubs', { max: 20 }));
  const prompt = once.get('Prompt');
  if (prompt && !prompt.value) r.error(emptyLine('Prompt'), prompt.line);
  const answer = answerOf(r, once.get('Answer'));

  if (r.failed() || !answer) return { errors: r.errors };
  return { errors: r.errors, question: { kind: 'career-path', questionNumber: block.questionNumber, lineNumber: block.lineNumber, prompt: prompt?.value || null, clubs, display: answer.display, aliases: answer.aliases } };
}

function parseBlock(block: Block, type: TdUploadType): Parsed<TdParsedQuestion> {
  switch (type) {
    case 'cards':
    case 'whoami-subjects':
      return parseClues(block, type);
    case 'box-questions':
    case 'penalty-questions':
      return parseQa(block, type);
    case 'practice-questions':
      return parsePractice(block);
    case 'football-logic':
      return parseLogic(block);
    case 'put-in-order':
      return parseOrder(block);
    case 'career-path':
      return parseCareer(block);
  }
}

/** What a question says, apart from where it stands in the file. */
function signature(question: TdParsedQuestion): string {
  const content: Record<string, unknown> = { ...question };
  delete content.questionNumber;
  delete content.lineNumber;
  return canonicalJson(content);
}

export function parseTdUpload(content: string, type: TdUploadType): TdParseResult {
  const { blocks, errors } = splitIntoBlocks(content, type);
  const questions: TdParsedQuestion[] = [];
  // The line each question was first written on: one written twice is reported, and read once.
  const seen = new Map<string, number>();

  for (const block of blocks) {
    const parsed = parseBlock(block, type);
    errors.push(...parsed.errors);
    const question = parsed.question;
    if (!question) continue;
    const key = signature(question);
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({ lineNumber: question.lineNumber, questionNumber: question.questionNumber, message: t('The same as line {line}: remove one of them.', { line: first }), severity: 'error' });
      continue;
    }
    seen.set(key, question.lineNumber);
    questions.push(question);
  }
  return { questions, errors };
}

/** The line that stands for a question in a list (Quizball's summary: the first clue, the prompt, or the club chain). */
export function tdQuestionSummary(question: TdParsedQuestion): string {
  switch (question.kind) {
    case 'cards':
    case 'whoami-subjects':
      return question.clues[0] || question.display;
    case 'box-questions':
    case 'penalty-questions':
      return question.q;
    case 'practice-questions':
    case 'put-in-order':
      return question.prompt;
    case 'football-logic':
      return question.prompt || question.display;
    case 'career-path':
      return question.clubs.join(' ➔ ');
  }
}

/* ── an import item ────────────────────────────────────────────────── */

export interface TdClubRef {
  key: string;
  label: string;
  value: string;
}

/** What the dialog chooses for the whole upload. */
export interface TdUploadContext {
  /** Round I and Round III: the category's key. */
  categoryKey: string;
  /** Practice and Football Logic: the category's label. */
  category: string;
  /** The three dailies: the puzzle's key. */
  puzzle: string;
  clubs: readonly TdClubRef[];
  /** The pictures chosen with the file: lower-cased file name → the key its image is saved under. */
  pictures?: ReadonlyMap<string, string>;
}

/** The image key a question's Image line comes to: its picture's (once chosen), or the uploaded image it names. */
export function imageKeyIn(question: { imageKey: string | null; imageFile: string | null }, context: Pick<TdUploadContext, 'pictures'>): string | null {
  return question.imageFile ? (context.pictures?.get(question.imageFile.toLowerCase()) ?? null) : question.imageKey;
}

const clubName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();

/** A club of the clubs list by the name a file gives it (its label, value or key, spelled alike), or null. */
export function matchClub(name: string, clubs: readonly TdClubRef[]): string | null {
  const wanted = clubName(name);
  if (!wanted) return null;
  const found = clubs.find((club) => clubName(club.label) === wanted) ?? clubs.find((club) => clubName(club.value) === wanted) ?? clubs.find((club) => clubName(club.key) === wanted);
  return found?.key ?? null;
}

export const careerClubs = (question: ParsedCareerPath, clubs: readonly TdClubRef[]) => question.clubs.map((name) => ({ name, clubKey: matchClub(name, clubs) }));

/** The row's fields as a sheet's columns read them (import-format.ts), without its ID. */
function columnValues(question: TdParsedQuestion, context: TdUploadContext): Record<string, unknown> {
  switch (question.kind) {
    case 'cards':
      return {
        categoryKey: context.categoryKey,
        value: question.points,
        display: question.display,
        aliases: question.aliases,
        lines: question.clues,
        photoId: question.photo?.id ?? null,
        photoVer: question.photo?.ver ?? null,
        imageKey: imageKeyIn(question, context),
      };
    case 'whoami-subjects':
      return { display: question.display, aliases: question.aliases, clues: question.clues };
    case 'box-questions':
      return { categoryKey: context.categoryKey, q: question.q, display: question.display, aliases: question.aliases };
    case 'penalty-questions':
      return { q: question.q, display: question.display, aliases: question.aliases };
    case 'practice-questions':
      return {
        difficulty: question.difficulty,
        category: context.category,
        prompt: question.prompt,
        options: question.options.map((option) => option.text),
        answer: question.options.findIndex((option) => option.isCorrect) + 1,
        explanation: question.explanation,
        imageKey: imageKeyIn(question, context),
      };
    case 'football-logic':
      return {
        puzzle: context.puzzle,
        category: context.category,
        prompt: question.prompt,
        imageA: question.imageA,
        imageB: question.imageB,
        displayAnswer: question.display,
        acceptedAnswers: question.aliases,
      };
    case 'put-in-order': {
      const rank = new Map(question.order.map((label, index) => [normalizeAlias(label), index + 1]));
      return {
        puzzle: context.puzzle,
        prompt: question.prompt,
        items: question.items.map((label, index) => ({ key: `item-${index + 1}`, label, sortValue: rank.get(normalizeAlias(label)) ?? 0 })),
      };
    }
    case 'career-path':
      return {
        puzzle: context.puzzle,
        prompt: question.prompt ?? t('Whose career is this?'),
        displayAnswer: question.display,
        acceptedAnswers: question.aliases,
        clubs: careerClubs(question, context.clubs),
      };
  }
}

/** The import item of a question: a draft of its mode's type, under the ID its content makes. */
export function toTdImportItem(question: TdParsedQuestion, context: TdUploadContext) {
  const values = columnValues(question, context);
  // The ID comes from what the file says: a club found in the clubs list later must not make the same row a new one.
  const said = question.kind === 'career-path' ? { ...values, clubs: (values.clubs as Array<{ name: string }>).map((club) => ({ name: club.name, clubKey: null })) } : values;
  return toItem(question.kind, { key: madeKey(question.kind, said), ...values });
}
