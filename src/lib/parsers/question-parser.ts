import type {
  BulkCreateQuestionsRequest,
  CareerPathPayload,
  FootballLogicPayload,
  HighLowPayload,
  ImposterMultiSelectPayload,
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
  imageUrl?: string;
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

export interface ParsedImposterQuestion extends ParsedBaseQuestion {
  kind: 'imposter_multi_select';
  prompt: string;
  options: Array<{ text: string; is_correct: boolean }>;
}

export interface ParsedCareerPathQuestion extends ParsedBaseQuestion {
  kind: 'career_path';
  prompt: string;
  clubs: string[];
  displayAnswer: string;
  acceptedAnswers: string[];
}

export interface ParsedHighLowQuestion extends ParsedBaseQuestion {
  kind: 'high_low';
  prompt: string;
  statLabel: string;
  matchups: Array<{
    leftName: string;
    leftValue: number;
    rightName: string;
    rightValue: number;
  }>;
}

export interface ParsedFootballLogicQuestion extends ParsedBaseQuestion {
  kind: 'football_logic';
  prompt?: string;
  imageAUrl: string;
  imageBUrl: string;
  displayAnswer: string;
  acceptedAnswers: string[];
}

export type ParsedBulkQuestion =
  | ParsedMcqQuestion
  | ParsedTrueFalseQuestion
  | ParsedCountdownQuestion
  | ParsedClueChainQuestion
  | ParsedPutInOrderQuestion
  | ParsedImposterQuestion
  | ParsedCareerPathQuestion
  | ParsedHighLowQuestion
  | ParsedFootballLogicQuestion;

export interface ParseResult {
  questions: ParsedBulkQuestion[];
  errors: ParseError[];
}

type UploadQuestionType = Extract<
  QuestionType,
  | 'mcq_single'
  | 'true_false'
  | 'countdown_list'
  | 'clue_chain'
  | 'put_in_order'
  | 'imposter_multi_select'
  | 'career_path'
  | 'high_low'
  | 'football_logic'
>;

type Difficulty = ParsedBaseQuestion['difficulty'];

interface ParsedBlock {
  questionNumber: number;
  lineNumber: number;
  lines: string[];
}

const QUESTION_START = /^(\d+)\.\s*(.*)$/;
const DIFFICULTY_LINE = /^Difficulty:\s*(Easy|Medium|Hard)\s*$/i;
const EXPLANATION_LINE = /^Explanation:\s*(.*)$/i;
const IMAGE_LINE = /^Image:\s*(.+)$/i;
const DIRECT_IMAGE_PATH = /\.(?:jpg|jpeg|png|webp|gif)$/i;

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

function isLikelyRenderableImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const pathname = decodeURIComponent(url.pathname).toLowerCase();

    if (DIRECT_IMAGE_PATH.test(pathname)) return true;
    if (hostname === 'commons.wikimedia.org' && pathname.includes('/wiki/special:redirect/file/')) return true;
    if (hostname.endsWith('upload.wikimedia.org')) return true;

    return false;
  } catch {
    return false;
  }
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

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
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

function shouldStartNewBlock(
  type: UploadQuestionType,
  current: ParsedBlock | null
): boolean {
  if (!current) {
    return true;
  }

  if (type !== 'put_in_order') {
    return true;
  }

  const currentLines = current.lines.map((line) => line.trim());
  const hasDifficulty = currentLines.some((line) => DIFFICULTY_LINE.test(line));
  return hasDifficulty;
}

function splitIntoBlocks(content: string, type: UploadQuestionType): { blocks: ParsedBlock[]; errors: ParseError[] } {
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

    if (match && shouldStartNewBlock(type, current)) {
      const questionNumber = Number.parseInt(match[1] ?? '0', 10);
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
  const [prompt, ...contentLines] = metadata.contentLines;
  const optionLines: string[] = [];
  let imageUrl: string | undefined;

  if (!prompt) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing question prompt',
      severity: 'error',
    });
    return { errors };
  }

  for (const line of contentLines) {
    const imageMatch = line.match(IMAGE_LINE);
    if (imageMatch) {
      const nextImageUrl = imageMatch[1]?.trim() ?? '';
      if (imageUrl) {
        errors.push({
          lineNumber: block.lineNumber,
          questionNumber: block.questionNumber,
          message: 'Duplicate image line',
          severity: 'error',
        });
      } else if (!isValidUrl(nextImageUrl)) {
        errors.push({
          lineNumber: block.lineNumber,
          questionNumber: block.questionNumber,
          message: 'Image line must contain a valid URL',
          severity: 'error',
        });
      } else {
        imageUrl = nextImageUrl;
        if (!isLikelyRenderableImageUrl(nextImageUrl)) {
          errors.push({
            lineNumber: block.lineNumber,
            questionNumber: block.questionNumber,
            message: 'Image URL may not render. Use a direct JPG, PNG, WebP, GIF, or Wikimedia file redirect URL, not a webpage/detail URL.',
            severity: 'warning',
          });
        }
      }
      continue;
    }

    optionLines.push(line);
  }

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
      message:
        correctCount === 0
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
      imageUrl,
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

  const clueNumbers = clueLines.map((line) => Number.parseInt(line.match(/^Clue\s+(\d+):/i)?.[1] ?? '0', 10));
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

  const parsedAnswer = splitAliases(answerLine!.replace(/^Answer:\s*/i, ''));
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
  const itemsIndex = rest.findIndex((line) => /^Items:\s*$/i.test(line));
  const answerIndex = rest.findIndex((line) => /^Answer:\s*$/i.test(line));

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

function parseImposterBlock(block: ParsedBlock): { question?: ParsedImposterQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const correctAnswersLine = metadata.contentLines.find((line) => /^Correct Answers:/i.test(line));
  const linesWithoutCorrect = metadata.contentLines.filter((line) => !/^Correct Answers:/i.test(line));
  const [firstLine, ...optionLines] = linesWithoutCorrect;
  const prompt = firstLine?.replace(/^Question:\s*/i, '').trim() || '';

  if (!prompt) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing question prompt',
      severity: 'error',
    });
  }

  const correctAnswers = new Set(
    correctAnswersLine
      ? correctAnswersLine
          .replace(/^Correct Answers:\s*/i, '')
          .split(',')
          .map((value) => normalizeAlias(value))
          .filter(Boolean)
      : []
  );

  const options = optionLines
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const isMarkedCorrect = line.endsWith('*');
      const text = isMarkedCorrect ? line.slice(0, -1).trim() : line;
      return {
        text,
        is_correct: isMarkedCorrect || correctAnswers.has(normalizeAlias(text)),
      };
    });

  if (options.length < 4 || options.length > 12) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Imposter questions require between 4 and 12 options',
      severity: 'error',
    });
  }

  if (!options.some((option) => option.is_correct) || !options.some((option) => !option.is_correct)) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Imposter questions need at least one correct option and one incorrect option',
      severity: 'error',
    });
  }

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  return {
    question: {
      kind: 'imposter_multi_select',
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

function parseCareerPathBlock(block: ParsedBlock): { question?: ParsedCareerPathQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const answerLine = metadata.contentLines.find((line) => /^Answer:/i.test(line));
  const promptLine = metadata.contentLines.find((line) => !/^Answer:/i.test(line)) ?? '';
  const prompt = promptLine.replace(/^Question:\s*/i, '').trim();
  const clubs = prompt
    .split(/(?:➔|->|→)/)
    .map((club) => club.trim())
    .filter(Boolean);

  if (clubs.length < 2) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Career Path questions need at least 2 clubs separated by arrows',
      severity: 'error',
    });
  }

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

  const parsedAnswer = splitAliases(answerLine!.replace(/^Answer:\s*/i, ''));

  return {
    question: {
      kind: 'career_path',
      questionNumber: block.questionNumber,
      prompt,
      clubs,
      displayAnswer: parsedAnswer.display,
      acceptedAnswers: parsedAnswer.aliases,
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

function parseHighLowSide(value: string): { name: string; stat: number } | null {
  const match = value.trim().match(/^(.*?)\s*\(([-\d.]+)\)\s*$/);
  if (!match) return null;
  return {
    name: match[1]?.trim() || '',
    stat: Number(match[2]),
  };
}

function parseHighLowBlock(block: ParsedBlock): { question?: ParsedHighLowQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const questionLine = metadata.contentLines.find((line) => /^Question:/i.test(line)) ?? metadata.contentLines[0] ?? '';
  const prompt = questionLine.replace(/^Question:\s*/i, '').trim();
  const statLabelLine = metadata.contentLines.find((line) => /^Stat Label:/i.test(line));
  const statLabel = statLabelLine?.replace(/^Stat Label:\s*/i, '').trim() || prompt;
  const matchups: ParsedHighLowQuestion['matchups'] = [];

  let index = 0;
  while (index < metadata.contentLines.length) {
    const line = metadata.contentLines[index] ?? '';
    if (!/^Matchup\s+\d+/i.test(line)) {
      index += 1;
      continue;
    }

    const correctLine = metadata.contentLines[index + 1] ?? '';
    const wrongLine = metadata.contentLines[index + 2] ?? '';
    const correctParsed = /^Correct Answer:/i.test(correctLine)
      ? parseHighLowSide(correctLine.replace(/^Correct Answer:\s*/i, ''))
      : null;
    const wrongParsed = /^Wrong Answer:/i.test(wrongLine)
      ? parseHighLowSide(wrongLine.replace(/^Wrong Answer:\s*/i, ''))
      : null;

    if (!correctParsed || !wrongParsed) {
      errors.push({
        lineNumber: block.lineNumber,
        questionNumber: block.questionNumber,
        message: 'Each High Low matchup needs Correct Answer and Wrong Answer lines with numeric values in parentheses',
        severity: 'error',
      });
      break;
    }

    matchups.push({
      leftName: correctParsed.name,
      leftValue: correctParsed.stat,
      rightName: wrongParsed.name,
      rightValue: wrongParsed.stat,
    });
    index += 3;
  }

  if (!prompt) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Missing question prompt',
      severity: 'error',
    });
  }

  if (matchups.length === 0) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'High Low questions need at least one matchup block',
      severity: 'error',
    });
  }

  if (errors.some((error) => error.severity === 'error')) {
    return { errors };
  }

  return {
    question: {
      kind: 'high_low',
      questionNumber: block.questionNumber,
      prompt,
      statLabel,
      matchups,
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

function parseFootballLogicBlock(block: ParsedBlock): { question?: ParsedFootballLogicQuestion; errors: ParseError[] } {
  const metadata = finalizeMetadata(block);
  const errors = [...metadata.errors];
  const promptLine =
    metadata.contentLines.find((line) => /^Prompt:/i.test(line))
    ?? metadata.contentLines.find((line) => !/^(Image A|Image B|Answer):/i.test(line));
  const imageALine = metadata.contentLines.find((line) => /^Image A:/i.test(line));
  const imageBLine = metadata.contentLines.find((line) => /^Image B:/i.test(line));
  const answerLine = metadata.contentLines.find((line) => /^Answer:/i.test(line));

  if (!imageALine || !imageBLine || !answerLine) {
    errors.push({
      lineNumber: block.lineNumber,
      questionNumber: block.questionNumber,
      message: 'Football Logic questions need Image A, Image B, and Answer lines',
      severity: 'error',
    });
    return { errors };
  }

  const parsedAnswer = splitAliases(answerLine.replace(/^Answer:\s*/i, ''));

  return {
    question: {
      kind: 'football_logic',
      questionNumber: block.questionNumber,
      prompt: promptLine ? promptLine.replace(/^Prompt:\s*/i, '').trim() : undefined,
      imageAUrl: imageALine.replace(/^Image A:\s*/i, '').trim(),
      imageBUrl: imageBLine.replace(/^Image B:\s*/i, '').trim(),
      displayAnswer: parsedAnswer.display,
      acceptedAnswers: parsedAnswer.aliases,
      difficulty: metadata.difficulty!,
      explanation: metadata.explanation,
      lineNumber: block.lineNumber,
    },
    errors,
  };
}

export function parseQuestionFile(content: string, type: UploadQuestionType): ParseResult {
  const { blocks, errors } = splitIntoBlocks(content, type);
  const questions: ParsedBulkQuestion[] = [];

  for (const block of blocks) {
    const parsed =
      type === 'mcq_single'
        ? parseMcqBlock(block)
        : type === 'true_false'
          ? parseTrueFalseBlock(block)
          : type === 'countdown_list'
            ? parseCountdownBlock(block)
            : type === 'clue_chain'
              ? parseClueChainBlock(block)
              : type === 'put_in_order'
                ? parsePutInOrderBlock(block)
                : type === 'imposter_multi_select'
                  ? parseImposterBlock(block)
                  : type === 'career_path'
                    ? parseCareerPathBlock(block)
                    : type === 'high_low'
                      ? parseHighLowBlock(block)
                      : parseFootballLogicBlock(block);

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
        ...(question.imageUrl
          ? {
              image: {
                url: question.imageUrl,
                width: 1440,
                height: 1080,
                aspect_ratio: '4:3',
                source_url: question.imageUrl,
                title: null,
                author: null,
                license: null,
                license_url: null,
                provider: 'bulk_upload',
              },
            }
          : {}),
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
          { id: 'true', text: localized(locale, 'True'), is_correct: question.answer },
          { id: 'false', text: localized(locale, 'False'), is_correct: !question.answer },
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

  if (question.kind === 'put_in_order') {
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

  if (question.kind === 'imposter_multi_select') {
    return {
      ...base,
      type: 'imposter_multi_select',
      prompt: localized(locale, question.prompt),
      payload: {
        type: 'imposter_multi_select',
        options: question.options.map((option) => ({
          id: generateAnswerId(),
          text: localized(locale, option.text),
          is_correct: option.is_correct,
        })),
      } satisfies ImposterMultiSelectPayload,
    };
  }

  if (question.kind === 'career_path') {
    return {
      ...base,
      type: 'career_path',
      prompt: localized(locale, question.prompt),
      payload: {
        type: 'career_path',
        clubs: question.clubs.map((club) => localized(locale, club)),
        display_answer: localized(locale, question.displayAnswer),
        accepted_answers: question.acceptedAnswers,
      } satisfies CareerPathPayload,
    };
  }

  if (question.kind === 'high_low') {
    return {
      ...base,
      type: 'high_low',
      prompt: localized(locale, question.prompt),
      payload: {
        type: 'high_low',
        stat_label: localized(locale, question.statLabel),
        matchups: question.matchups.map((matchup) => ({
          id: generateAnswerId(),
          left_name: localized(locale, matchup.leftName),
          left_value: matchup.leftValue,
          right_name: localized(locale, matchup.rightName),
          right_value: matchup.rightValue,
        })),
      } satisfies HighLowPayload,
    };
  }

  return {
    ...base,
    type: 'football_logic',
    prompt: localized(locale, question.prompt || question.displayAnswer),
    payload: {
      type: 'football_logic',
      image_a_url: question.imageAUrl,
      image_b_url: question.imageBUrl,
      display_answer: localized(locale, question.displayAnswer),
      accepted_answers: question.acceptedAnswers,
      prompt: question.prompt ? localized(locale, question.prompt) : undefined,
      explanation: question.explanation ? localized(locale, question.explanation) : null,
    } satisfies FootballLogicPayload,
  };
}
