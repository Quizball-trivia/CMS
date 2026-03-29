import type {
  BulkCreateQuestionsRequest,
  QuestionType,
  TrueFalsePayload,
} from '@/types';
import { generateAnswerId } from '@/lib/question-utils';

export interface ParseError {
  lineNumber: number;
  questionNumber?: number;
  message: string;
  severity: 'error' | 'warning';
}

interface ParsedBaseQuestion {
  questionNumber: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation?: string;
  lineNumber: number;
}

export interface ParsedMcqQuestion extends ParsedBaseQuestion {
  kind: 'mcq_single';
  prompt: string;
  options: Array<{ letter: string; text: string; is_correct: boolean }>;
}

export interface ParsedTrueFalseQuestion extends ParsedBaseQuestion {
  kind: 'true_false';
  prompt: string;
  answer: boolean;
}

export interface ParsedCountdownQuestion extends ParsedBaseQuestion {
  kind: 'countdown_list';
  prompt: string;
  answers: Array<{ display: string; aliases: string[] }>;
}

export interface ParsedClueChainQuestion extends ParsedBaseQuestion {
  kind: 'clue_chain';
  clues: string[];
  displayAnswer: string;
  acceptedAnswers: string[];
}

export interface ParsedPutInOrderQuestion extends ParsedBaseQuestion {
  kind: 'put_in_order';
  prompt: string;
  direction: 'asc' | 'desc';
  items: string[];
  orderedAnswer: string[];
}

export type ParsedBulkQuestion =
  | ParsedMcqQuestion
  | ParsedTrueFalseQuestion
  | ParsedCountdownQuestion
  | ParsedClueChainQuestion
  | ParsedPutInOrderQuestion;

export interface ParseResult {
  questions: ParsedBulkQuestion[];
  errors: ParseError[];
}

type UploadQuestionType = Extract<QuestionType, 'mcq_single' | 'true_false' | 'countdown_list' | 'clue_chain' | 'put_in_order'>;
type Difficulty = ParsedBaseQuestion['difficulty'];

interface ParsedBlock {
  questionNumber: number;
  lineNumber: number;
  lines: string[];
}

const QUESTION_START = /^(\d+)\.\s*(.*)$/;
const DIFFICULTY_LINE = /^Difficulty:\s*(Easy|Medium|Hard)\s*$/i;
const EXPLANATION_LINE = /^Explanation:\s*(.*)$/i;

function normalizeLineBreaks(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n');
}

function normalizeAlias(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitAliases(line: string): { display: string; aliases: string[] } {
  const tokens = line.split('|').map((token) => token.trim()).filter(Boolean);
  const display = tokens[0] ?? line.trim();
  const seen = new Set<string>();
  const aliases = tokens.length > 0 ? tokens : [display];
  return {
    display,
    aliases: aliases.filter((alias) => {
      const normalized = normalizeAlias(alias);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }),
  };
}

function finalizeMetadata(
  block: ParsedBlock
): { contentLines: string[]; difficulty?: Difficulty; explanation?: string; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const contentLines: string[] = [];
  const explanationLines: string[] = [];
  let difficulty: Difficulty | undefined;
  let inExplanation = false;

  for (let index = 0; index < block.lines.length; index += 1) {
    const rawLine = block.lines[index] ?? '';
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (inExplanation) explanationLines.push('');
      continue;
    }

    const difficultyMatch = trimmed.match(DIFFICULTY_LINE);
    if (difficultyMatch) {
      if (difficulty) {
        errors.push({
          lineNumber: block.lineNumber + index,
          questionNumber: block.questionNumber,
          message: 'Duplicate difficulty line',
          severity: 'error',
        });
      } else {
        difficulty = difficultyMatch[1].toLowerCase() as Difficulty;
      }
      inExplanation = false;
      continue;
    }

    const explanationMatch = trimmed.match(EXPLANATION_LINE);
    if (explanationMatch) {
      explanationLines.length = 0;
      explanationLines.push(explanationMatch[1].trim());
      inExplanation = true;
      continue;
    }

    if (inExplanation) {
      explanationLines.push(trimmed);
    } else {
      contentLines.push(trimmed);
    }
  }

  if (!difficulty) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing difficulty level (use "Difficulty: Easy/Medium/Hard")',
      severity: 'error',
    });
  }

  return {
    contentLines,
    difficulty,
    explanation: explanationLines.join(' ').trim() || undefined,
    errors,
  };
}

function splitIntoBlocks(content: string): { blocks: ParsedBlock[]; errors: ParseError[] } {
  const lines = normalizeLineBreaks(content);
  const blocks: ParsedBlock[] = [];
  const errors: ParseError[] = [];
  const seenQuestionNumbers = new Set<number>();
  let lastQuestionNumber: number | null = null;
  let current: ParsedBlock | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const match = trimmed.match(QUESTION_START);

    if (match) {
      const questionNumber = parseInt(match[1] ?? '0', 10);
      if (seenQuestionNumbers.has(questionNumber)) {
        errors.push({
          lineNumber,
          questionNumber,
          message: `Duplicate question number ${questionNumber}`,
          severity: 'warning',
        });
      }
      if (lastQuestionNumber !== null && questionNumber !== lastQuestionNumber + 1) {
        errors.push({
          lineNumber,
          questionNumber,
          message: `Expected question number ${lastQuestionNumber + 1}, found ${questionNumber}`,
          severity: 'warning',
        });
      }
      seenQuestionNumbers.add(questionNumber);
      lastQuestionNumber = questionNumber;

      if (current) {
        blocks.push(current);
      }

      current = {
        questionNumber,
        lineNumber,
        lines: [],
      };

      const promptTail = (match[2] ?? '').trim();
      if (promptTail) {
        current.lines.push(promptTail);
      }
      return;
    }

    if (!current) {
      if (trimmed) {
        errors.push({
          lineNumber,
          message: 'Content found before the first numbered question',
          severity: 'warning',
        });
      }
      return;
    }

    current.lines.push(line);
  });

  if (current) {
    blocks.push(current);
  }

  return { blocks, errors };
}

function parseMcqBlock(block: ParsedBlock): { question?: ParsedMcqQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  if (metadata.contentLines.length === 0) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing question prompt',
      severity: 'error',
    });
    return { errors };
  }

  const [prompt, ...optionLines] = metadata.contentLines;
  const options = optionLines
    .map((line) => line.match(/^([A-D])\)\s+(.+?)(\*?)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      letter: match[1] ?? '',
      text: (match[2] ?? '').trim(),
      is_correct: (match[3] ?? '') === '*',
    }));

  if (options.length !== 4) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: `Must have exactly 4 options (A, B, C, D), found ${options.length}`,
      severity: 'error',
    });
  }

  const correctCount = options.filter((option) => option.is_correct).length;
  if (correctCount !== 1) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: correctCount === 0
        ? 'No correct answer marked (use * after correct option)'
        : 'Multiple correct answers marked (only one allowed)',
      severity: 'error',
    });
  }

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  return {
    question: {
      kind: 'mcq_single',
      questionNumber: block.questionNumber,
      prompt,
      options,
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

function parseTrueFalseBlock(block: ParsedBlock): { question?: ParsedTrueFalseQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const answerLine = metadata.contentLines.find((line) => /^Answer:\s*(true|false)\s*$/i.test(line));
  const promptLines = metadata.contentLines.filter((line) => !/^Answer:/i.test(line));

  if (promptLines.length !== 1) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'True / False questions need exactly one statement line before metadata',
      severity: 'error',
    });
  }

  if (!answerLine) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing answer line (use "Answer: True" or "Answer: False")',
      severity: 'error',
    });
  }

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  return {
    question: {
      kind: 'true_false',
      questionNumber: block.questionNumber,
      prompt: promptLines[0]!,
      answer: /true/i.test(answerLine!),
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

function parseCountdownBlock(block: ParsedBlock): { question?: ParsedCountdownQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const [prompt, ...answerLines] = metadata.contentLines;

  if (!prompt) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing question prompt',
      severity: 'error',
    });
  }

  const answers = answerLines
    .filter(Boolean)
    .map(splitAliases)
    .filter((entry) => entry.display.length > 0 && entry.aliases.length > 0);

  if (answers.length === 0) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Countdown questions require at least one answer line',
      severity: 'error',
    });
  }

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  return {
    question: {
      kind: 'countdown_list',
      questionNumber: block.questionNumber,
      prompt: prompt!,
      answers,
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

function parseClueChainBlock(block: ParsedBlock): { question?: ParsedClueChainQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const clueLines = metadata.contentLines.filter((line) => /^Clue\s+\d+:/i.test(line));
  const answerLine = metadata.contentLines.find((line) => /^Answer:/i.test(line));

  if (clueLines.length < 2) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Clue chain questions need at least 2 clue lines',
      severity: 'error',
    });
  }

  const clueNumbers = clueLines.map((line) => parseInt(line.match(/^Clue\s+(\d+):/i)?.[1] ?? '0', 10));
  clueNumbers.forEach((number, index) => {
    if (number !== index + 1) {
      errors.push({
        lineNumber: block.lineNumber,
        questionNumber: block.questionNumber,
        message: 'Clues must be numbered sequentially starting from 1',
        severity: 'error',
      });
    }
  });

  if (!answerLine) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing answer line',
      severity: 'error',
    });
  }

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  const answerValue = answerLine!.replace(/^Answer:\s*/i, '');
  const parsedAnswer = splitAliases(answerValue);

  return {
    question: {
      kind: 'clue_chain',
      questionNumber: block.questionNumber,
      clues: clueLines.map((line) => line.replace(/^Clue\s+\d+:\s*/i, '').trim()),
      displayAnswer: parsedAnswer.display,
      acceptedAnswers: parsedAnswer.aliases,
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

function parsePutInOrderBlock(block: ParsedBlock): { question?: ParsedPutInOrderQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const [prompt, ...rest] = metadata.contentLines;

  const directionLine = rest.find((line) => /^Direction:\s*(asc|desc)\s*$/i.test(line));
  if (!prompt) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing question prompt',
      severity: 'error',
    });
  }
  if (!directionLine) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing direction line (use "Direction: asc" or "Direction: desc")',
      severity: 'error',
    });
  }

  const itemsIndex = rest.findIndex((line) => /^Items:\s*$/i.test(line));
  const answerIndex = rest.findIndex((line) => /^Answer:\s*$/i.test(line));
  if (itemsIndex === -1) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing Items section',
      severity: 'error',
    });
  }
  if (answerIndex === -1) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing Answer section',
      severity: 'error',
    });
  }

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  const items = rest
    .slice(itemsIndex + 1, answerIndex)
    .map((line) => line.match(/^-\s+(.+)$/)?.[1]?.trim() ?? '')
    .filter(Boolean);

  const orderedAnswer = rest
    .slice(answerIndex + 1)
    .map((line) => line.match(/^\d+\.\s+(.+)$/)?.[1]?.trim() ?? '')
    .filter(Boolean);

  if (items.length < 3) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Put in Order questions require at least 3 items',
      severity: 'error',
    });
  }

  if (orderedAnswer.length !== items.length) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Answer item count must match item count',
      severity: 'error',
    });
  }

  const normalizedItems = new Set(items.map((item) => normalizeAlias(item)));
  orderedAnswer.forEach((answer) => {
    if (!normalizedItems.has(normalizeAlias(answer))) {
      errors.push({
        lineNumber: block.lineNumber,
        questionNumber: block.questionNumber,
        message: `Answer item "${answer}" does not match any listed item`,
        severity: 'error',
      });
    }
  });

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  return {
    question: {
      kind: 'put_in_order',
      questionNumber: block.questionNumber,
      prompt: prompt!,
      direction: directionLine!.match(/(asc|desc)/i)![1]!.toLowerCase() as 'asc' | 'desc',
      items,
      orderedAnswer,
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

export function parseQuestionFile(content: string, type: UploadQuestionType): ParseResult {
  const { blocks, errors } = splitIntoBlocks(content);
  const questions: ParsedBulkQuestion[] = [];

  for (const block of blocks) {
    const parsed = type === 'mcq_single'
      ? parseMcqBlock(block)
      : type === 'true_false'
        ? parseTrueFalseBlock(block)
        : type === 'countdown_list'
          ? parseCountdownBlock(block)
          : type === 'clue_chain'
            ? parseClueChainBlock(block)
            : parsePutInOrderBlock(block);

    errors.push(...parsed.errors);
    if (parsed.question) {
      questions.push(parsed.question);
    }
  }

  return { questions, errors };
}

function localized(locale: 'en' | 'ka', text: string) {
  return { [locale]: text } as Record<'en' | 'ka', string>;
}

export function toBulkCreateQuestion(
  question: ParsedBulkQuestion,
  locale: 'en' | 'ka'
): BulkCreateQuestionsRequest['questions'][number] {
  const base = {
    difficulty: question.difficulty,
    status: 'draft' as const,
    explanation: question.explanation ? localized(locale, question.explanation) : null,
  };

  if (question.kind === 'mcq_single') {
    return {
      ...base,
      type: 'mcq_single',
      prompt: localized(locale, question.prompt),
      payload: {
        type: 'mcq_single',
        options: question.options.map((option) => ({
          id: generateAnswerId(),
          text: localized(locale, option.text),
          is_correct: option.is_correct,
        })),
      },
    };
  }

  if (question.kind === 'true_false') {
    return {
      ...base,
      type: 'true_false',
      prompt: localized(locale, question.prompt),
      payload: {
        type: 'true_false',
        options: [
          {
            id: 'true',
            text: localized(locale, 'True'),
            is_correct: question.answer,
          },
          {
            id: 'false',
            text: localized(locale, 'False'),
            is_correct: !question.answer,
          },
        ],
      } satisfies TrueFalsePayload,
    };
  }

  if (question.kind === 'countdown_list') {
    return {
      ...base,
      type: 'countdown_list',
      prompt: localized(locale, question.prompt),
      payload: {
        type: 'countdown_list',
        prompt: localized(locale, question.prompt),
        answer_groups: question.answers.map((answer) => ({
          id: generateAnswerId(),
          display: localized(locale, answer.display),
          accepted_answers: answer.aliases,
        })),
      },
    };
  }

  if (question.kind === 'clue_chain') {
    return {
      ...base,
      type: 'clue_chain',
      prompt: localized(locale, question.clues[0] || question.displayAnswer),
      payload: {
        type: 'clue_chain',
        display_answer: localized(locale, question.displayAnswer),
        accepted_answers: question.acceptedAnswers,
        clues: question.clues.map((clue) => ({
          type: 'text' as const,
          content: localized(locale, clue),
        })),
      },
    };
  }

  const orderMap = new Map(question.orderedAnswer.map((answer, index) => [normalizeAlias(answer), index + 1]));
  return {
    ...base,
    type: 'put_in_order',
    prompt: localized(locale, question.prompt),
    payload: {
      type: 'put_in_order',
      prompt: localized(locale, question.prompt),
      direction: question.direction,
      items: question.items.map((item) => ({
        id: generateAnswerId(),
        label: localized(locale, item),
        details: null,
        emoji: null,
        sort_value: orderMap.get(normalizeAlias(item)) ?? 0,
      })),
    },
  };
}
