import type { QuizManualQuestion } from '@/types';

export const MANUAL_QUESTION_EXAMPLE = `Question: Who managed Liverpool to the 2019–20 Premier League title?
A: Rafael Benítez
B: Jürgen Klopp
C: Brendan Rodgers
D: Steven Gerrard
Answer: B
Difficulty: easy
Explanation: Jürgen Klopp led Liverpool to the title.
---
Question: Which song is Liverpool's famous club anthem?
A: Blue Moon
B: I'm Forever Blowing Bubbles
C: You'll Never Walk Alone
D: Glory Glory
Answer: C
Difficulty: medium`;

type FieldName =
  | 'question'
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'answer'
  | 'difficulty'
  | 'explanation';
type QuestionFields = Partial<Record<FieldName, string>>;
const FIELD_PATTERN = /^(Question|A|B|C|D|Answer|Difficulty|Explanation)\s*:\s*(.*)$/i;

export interface ManualQuestionParseResult {
  questions: QuizManualQuestion[];
  errors: string[];
}

function parseBlock(block: string, index: number): { question?: QuizManualQuestion; errors: string[] } {
  const fields: QuestionFields = {};
  const errors: string[] = [];
  let activeField: FieldName | null = null;
  let reportedStrayLine = false;

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(FIELD_PATTERN);
    if (match) {
      activeField = match[1].toLowerCase() as FieldName;
      fields[activeField] = match[2].trim();
      continue;
    }
    if (activeField) {
      fields[activeField] = `${fields[activeField] ?? ''} ${line}`.trim();
    } else if (!reportedStrayLine) {
      reportedStrayLine = true;
      errors.push(`Question ${index}: every line must start with a field name such as “Question:” or “A:”.`);
    }
  }

  const required: FieldName[] = ['question', 'a', 'b', 'c', 'd', 'answer', 'difficulty'];
  for (const field of required) {
    if (!fields[field]) errors.push(`Question ${index}: ${field === 'question' ? 'Question' : field.toUpperCase()} is required.`);
  }

  const answer = fields.answer?.toLowerCase();
  if (answer && !['a', 'b', 'c', 'd'].includes(answer)) {
    errors.push(`Question ${index}: Answer must be A, B, C or D.`);
  }
  const difficulty = fields.difficulty?.toLowerCase();
  if (difficulty && !['easy', 'medium', 'hard'].includes(difficulty)) {
    errors.push(`Question ${index}: Difficulty must be easy, medium or hard.`);
  }

  const optionValues = [fields.a, fields.b, fields.c, fields.d].filter(Boolean) as string[];
  if (optionValues.length === 4) {
    const normalized = optionValues.map((option) => option.toLocaleLowerCase('en'));
    if (new Set(normalized).size !== 4) {
      errors.push(`Question ${index}: answer options must be different.`);
    }
  }

  if (errors.length > 0) return { errors };
  return {
    question: {
      prompt: fields.question!,
      options: [fields.a!, fields.b!, fields.c!, fields.d!],
      correct_option: answer as QuizManualQuestion['correct_option'],
      difficulty: difficulty as QuizManualQuestion['difficulty'],
      explanation: fields.explanation || null,
    },
    errors,
  };
}

export function parseManualQuestions(value: string): ManualQuestionParseResult {
  const trimmed = value.trim();
  if (!trimmed) return { questions: [], errors: [] };

  const blocks = trimmed
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean);
  const questions: QuizManualQuestion[] = [];
  const errors: string[] = [];

  blocks.forEach((block, index) => {
    const parsed = parseBlock(block, index + 1);
    if (parsed.question) questions.push(parsed.question);
    errors.push(...parsed.errors);
  });

  if (blocks.length > 15) errors.push('A quiz can contain at most 15 manually entered questions.');
  const normalizedPrompts = questions.map((question) => question.prompt.toLocaleLowerCase('en'));
  if (new Set(normalizedPrompts).size !== normalizedPrompts.length) {
    errors.push('Every question prompt must be unique within the set.');
  }

  return { questions, errors };
}

export function formatManualQuestions(questions: QuizManualQuestion[]): string {
  return questions
    .map((question) => {
      const lines = [
        `Question: ${question.prompt}`,
        `A: ${question.options[0]}`,
        `B: ${question.options[1]}`,
        `C: ${question.options[2]}`,
        `D: ${question.options[3]}`,
        `Answer: ${question.correct_option.toUpperCase()}`,
        `Difficulty: ${question.difficulty}`,
      ];
      if (question.explanation) lines.push(`Explanation: ${question.explanation}`);
      return lines.join('\n');
    })
    .join('\n---\n');
}
