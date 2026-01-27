/**
 * Question file parser for bulk upload feature.
 * Parses .txt files with questions in a simple human-readable format.
 */

export interface ParsedQuestion {
  questionNumber: number;
  prompt: string;
  options: Array<{ letter: string; text: string; is_correct: boolean }>;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation?: string;
  lineNumber: number; // For error reporting
}

export interface ParseError {
  lineNumber: number;
  questionNumber?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  questions: ParsedQuestion[];
  errors: ParseError[];
}

/**
 * Parse a question file in the following format:
 *
 * 1. Question text here?
 *
 * A) Option 1
 * B) Option 2*
 * C) Option 3
 * D) Option 4
 * Difficulty: Easy
 * Explanation: Optional explanation text
 *
 * - Questions separated by blank lines
 * - Correct answer marked with asterisk (*)
 * - Difficulty: Easy, Medium, or Hard (case-insensitive)
 * - Explanation is optional
 */
export function parseQuestionFile(content: string): ParseResult {
  const lines = content.split('\n');
  const questions: ParsedQuestion[] = [];
  const errors: ParseError[] = [];

  let currentQuestion: Partial<ParsedQuestion> | null = null;
  let currentExplanation: string[] = [];
  let lineNumber = 0;
  let inExplanation = false;

  // Parse line by line
  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();

    // Skip empty lines (end of question)
    if (!trimmed) {
      if (currentQuestion) {
        // Finalize current question
        if (currentExplanation.length > 0) {
          currentQuestion.explanation = currentExplanation.join(' ').trim();
        }
        const validated = validateQuestion(currentQuestion, lineNumber);
        if (validated.errors.length > 0) {
          errors.push(...validated.errors);
        } else if (validated.question) {
          questions.push(validated.question);
        }
        currentQuestion = null;
        currentExplanation = [];
        inExplanation = false;
      }
      continue;
    }

    // Check for question start (1., 2., etc.)
    const questionMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (questionMatch) {
      // Save previous question if exists
      if (currentQuestion) {
        if (currentExplanation.length > 0) {
          currentQuestion.explanation = currentExplanation.join(' ').trim();
        }
        const validated = validateQuestion(currentQuestion, lineNumber - 1);
        if (validated.errors.length > 0) {
          errors.push(...validated.errors);
        } else if (validated.question) {
          questions.push(validated.question);
        }
        currentExplanation = [];
        inExplanation = false;
      }

      // Start new question
      currentQuestion = {
        questionNumber: parseInt(questionMatch[1], 10),
        prompt: questionMatch[2],
        options: [],
        lineNumber,
      };
      continue;
    }

    // If no current question, skip line
    if (!currentQuestion) {
      continue;
    }

    // Check for option (A), B), C), D))
    const optionMatch = trimmed.match(/^([A-D])\)\s+(.+?)(\*?)$/);
    if (optionMatch) {
      const [, letter, text, asterisk] = optionMatch;
      currentQuestion.options = currentQuestion.options || [];
      currentQuestion.options.push({
        letter,
        text: text.trim(),
        is_correct: asterisk === '*',
      });
      inExplanation = false;
      continue;
    }

    // Check for difficulty
    const difficultyMatch = trimmed.match(/^Difficulty:\s*(Easy|Medium|Hard)$/i);
    if (difficultyMatch) {
      currentQuestion.difficulty = difficultyMatch[1].toLowerCase() as 'easy' | 'medium' | 'hard';
      inExplanation = false;
      continue;
    }

    // Check for explanation
    const explanationMatch = trimmed.match(/^Explanation:\s*(.*)$/);
    if (explanationMatch) {
      currentExplanation = [explanationMatch[1]];
      inExplanation = true;
      continue;
    }

    // Continuation of explanation
    if (inExplanation) {
      currentExplanation.push(trimmed);
    }
  }

  // Finalize last question
  if (currentQuestion) {
    if (currentExplanation.length > 0) {
      currentQuestion.explanation = currentExplanation.join(' ').trim();
    }
    const validated = validateQuestion(currentQuestion, lineNumber);
    if (validated.errors.length > 0) {
      errors.push(...validated.errors);
    } else if (validated.question) {
      questions.push(validated.question);
    }
  }

  return { questions, errors };
}

function validateQuestion(
  q: Partial<ParsedQuestion>,
  lineNumber: number
): { question?: ParsedQuestion; errors: ParseError[] } {
  const errors: ParseError[] = [];

  if (!q.prompt) {
    errors.push({
      lineNumber,
      questionNumber: q.questionNumber,
      message: 'Missing question prompt',
      severity: 'error',
    });
  }

  if (!q.options || q.options.length !== 4) {
    errors.push({
      lineNumber,
      questionNumber: q.questionNumber,
      message: `Must have exactly 4 options (A, B, C, D), found ${q.options?.length || 0}`,
      severity: 'error',
    });
  }

  const correctCount = q.options?.filter((o) => o.is_correct).length || 0;
  if (correctCount === 0) {
    errors.push({
      lineNumber,
      questionNumber: q.questionNumber,
      message: 'No correct answer marked (use * after correct option)',
      severity: 'error',
    });
  } else if (correctCount > 1) {
    errors.push({
      lineNumber,
      questionNumber: q.questionNumber,
      message: 'Multiple correct answers marked (only one allowed)',
      severity: 'error',
    });
  }

  if (!q.difficulty) {
    errors.push({
      lineNumber,
      questionNumber: q.questionNumber,
      message: 'Missing difficulty level (use "Difficulty: Easy/Medium/Hard")',
      severity: 'error',
    });
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    question: q as ParsedQuestion,
    errors: [],
  };
}
