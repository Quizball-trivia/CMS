import type {
  AnswerWithId,
  CareerPathPayload,
  ClueChainPayload,
  CountdownPayload,
  FootballLogicPayload,
  HighLowPayload,
  ImposterMultiSelectPayload,
  PutInOrderPayload,
  Question,
  QuestionStatus,
  QuestionType,
  TrueFalsePayload,
} from '@/types';

export type AdvancedQuestionPayload =
  | CountdownPayload
  | ClueChainPayload
  | PutInOrderPayload
  | ImposterMultiSelectPayload
  | CareerPathPayload
  | HighLowPayload
  | FootballLogicPayload;

export interface QuestionFormData {
  category_id: string;
  locale: 'en' | 'ka';
  difficulty: 'easy' | 'medium' | 'hard';
  status: QuestionStatus;
  type:
    | 'mcq_single'
    | 'true_false'
    | 'input_text'
    | 'countdown_list'
    | 'clue_chain'
    | 'put_in_order'
    | 'imposter_multi_select'
    | 'career_path'
    | 'high_low'
    | 'football_logic';
  prompt: string;
  explanation: string;
  options: Array<{ id?: string; text: string; is_correct: boolean }>;
  acceptedAnswers: AnswerWithId[];
  caseSensitive: boolean;
  customPayload: AdvancedQuestionPayload | null;
}

/**
 * Transforms a Question object into form data for editing/viewing
 * @param question - The question to transform
 * @param preferredLocale - Preferred locale to extract text from (defaults to 'en')
 * @returns Form data ready for use in question forms
 */
export function questionToFormData(question: Question, preferredLocale: 'en' | 'ka' = 'en'): QuestionFormData {
  // Always use the requested locale so the user can add translations for missing locales
  const locale = preferredLocale;

  const baseData = {
    category_id: question.category_id,
    locale,
    difficulty: question.difficulty,
    status: question.status,
    type: question.type,
    prompt: question.prompt?.[locale] || '',
    explanation: question.explanation?.[locale] || '',
    caseSensitive: false,
    customPayload:
      question.type !== 'mcq_single' && question.type !== 'input_text' && question.type !== 'true_false' && question.payload
        ? question.payload
        : null,
  };

  if (question.type === 'mcq_single') {
    const payload = question.payload as { options?: Array<{ id: string; text: Record<string, string>; is_correct: boolean }> };
    return {
      ...baseData,
      options: payload.options?.map(opt => ({
        id: opt.id, // Preserve ID for updates
        text: opt.text?.[locale] || '',
        is_correct: opt.is_correct
      })) || [],
      acceptedAnswers: [],
      customPayload: null,
    };
  } else if (question.type === 'true_false') {
    const payload = question.payload as TrueFalsePayload | null;
    return {
      ...baseData,
      options: payload?.options?.map(opt => ({
        id: opt.id,
        text: opt.text?.[locale] || opt.text?.en || '',
        is_correct: opt.is_correct,
      })) || [],
      acceptedAnswers: [],
      customPayload: null,
    };
  } else if (question.type === 'input_text') {
    const payload = question.payload as {
      accepted_answers?: Array<Record<string, string>>; // Array<I18nField> - no wrapper
      case_sensitive?: boolean;
    };
    return {
      ...baseData,
      options: [],
      acceptedAnswers: payload.accepted_answers?.map(ans => ({
        id: generateAnswerId(), // Generate UI-only ID for React keys
        en: ans.en || '',
        ka: ans.ka || '',
      })) || [],
      caseSensitive: payload.case_sensitive || false,
      customPayload: null,
    };
  }

  return {
    ...baseData,
    options: [],
    acceptedAnswers: [],
    customPayload: (question.payload as AdvancedQuestionPayload | null) ?? null,
  };
}

export function createDefaultAdvancedPayload(type: QuestionType): AdvancedQuestionPayload | null {
  if (type === 'countdown_list') {
    return {
      type: 'countdown_list',
      prompt: { en: '' },
      answer_groups: [
        {
          id: generateAnswerId(),
          display: { en: '' },
          accepted_answers: [''],
        },
      ],
    };
  }

  if (type === 'clue_chain') {
    return {
      type: 'clue_chain',
      display_answer: { en: '' },
      accepted_answers: [''],
      clues: [
        {
          type: 'text',
          content: { en: '' },
        },
      ],
    };
  }

  if (type === 'put_in_order') {
    return {
      type: 'put_in_order',
      prompt: { en: '' },
      direction: 'asc',
      items: [
        { id: generateAnswerId(), label: { en: '' }, sort_value: 1, details: null, emoji: null },
        { id: generateAnswerId(), label: { en: '' }, sort_value: 2, details: null, emoji: null },
        { id: generateAnswerId(), label: { en: '' }, sort_value: 3, details: null, emoji: null },
      ],
    };
  }

  if (type === 'imposter_multi_select') {
    return {
      type: 'imposter_multi_select',
      options: [
        { id: generateAnswerId(), text: { en: '' }, is_correct: true },
        { id: generateAnswerId(), text: { en: '' }, is_correct: false },
        { id: generateAnswerId(), text: { en: '' }, is_correct: false },
        { id: generateAnswerId(), text: { en: '' }, is_correct: false },
      ],
    };
  }

  if (type === 'career_path') {
    return {
      type: 'career_path',
      clubs: [{ en: '' }, { en: '' }, { en: '' }],
      display_answer: { en: '' },
      accepted_answers: [''],
    };
  }

  if (type === 'high_low') {
    return {
      type: 'high_low',
      stat_label: { en: '' },
      matchups: [
        {
          id: generateAnswerId(),
          left_name: { en: '' },
          left_value: 0,
          right_name: { en: '' },
          right_value: 1,
        },
      ],
    };
  }

  if (type === 'football_logic') {
    return {
      type: 'football_logic',
      image_a_url: '',
      image_b_url: '',
      display_answer: { en: '' },
      accepted_answers: [''],
      prompt: { en: '' },
      explanation: null,
    };
  }

  return null;
}

/**
 * Helper to generate client-side IDs (only call from client components)
 * Uses crypto.randomUUID() if available, falls back to timestamp-based ID
 * @returns A unique ID string
 */
export function generateAnswerId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers or server-side (shouldn't happen in practice)
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const I18N_LOCALE_KEY = /^[a-z]{2}$/;

/**
 * Recursively drop empty/whitespace-only locale values from i18n fields in a
 * payload before sending it to the API.
 *
 * The backend `i18nFieldSchema` rejects any present locale key whose value is
 * an empty string ("Translation cannot be empty"). The editor, however, leaves
 * a `{ en: '...', ka: '' }` shape behind when only one language is filled in
 * (e.g. typing a display label in English but not Georgian). This prunes those
 * empty entries so single-language content validates, while preserving every
 * non-empty translation.
 */
export function stripEmptyTranslations<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripEmptyTranslations(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const looksLikeI18nField =
      entries.length > 0 &&
      entries.every(([key, val]) => I18N_LOCALE_KEY.test(key) && typeof val === 'string');

    if (looksLikeI18nField) {
      const pruned = Object.fromEntries(
        entries.filter(([, val]) => (val as string).trim().length > 0)
      );
      return pruned as T;
    }

    return Object.fromEntries(
      entries.map(([key, val]) => [key, stripEmptyTranslations(val)])
    ) as T;
  }
  return value;
}

function cleanAcceptedAnswerList(answers: string[]): string[] {
  return answers.map((answer) => answer.trim()).filter(Boolean);
}

function hasTranslation(value: Record<string, string> | null | undefined): boolean {
  return Boolean(value && Object.values(value).some((text) => text.trim().length > 0));
}

/**
 * Prepare advanced payloads before save so draft UI placeholders such as `['']`
 * do not get sent to the backend validator as real answers.
 */
export function prepareAdvancedPayloadForSave(payload: AdvancedQuestionPayload): AdvancedQuestionPayload {
  const stripped = stripEmptyTranslations(payload);

  if (stripped.type === 'countdown_list') {
    return {
      ...stripped,
      answer_groups: stripped.answer_groups.map((group) => ({
        ...group,
        accepted_answers: cleanAcceptedAnswerList(group.accepted_answers),
      })),
    };
  }

  if (
    stripped.type === 'clue_chain'
    || stripped.type === 'career_path'
    || stripped.type === 'football_logic'
  ) {
    return {
      ...stripped,
      accepted_answers: cleanAcceptedAnswerList(stripped.accepted_answers),
    };
  }

  return stripped;
}

export function getAdvancedPayloadSaveError(payload: AdvancedQuestionPayload): string | null {
  if (payload.type === 'countdown_list') {
    if (!hasTranslation(payload.prompt)) {
      return 'Countdown list needs a round prompt.';
    }
    if (payload.answer_groups.length === 0) {
      return 'Countdown list needs at least one answer group.';
    }

    const ids = payload.answer_groups.map((group) => group.id);
    if (new Set(ids).size !== ids.length) {
      return 'Countdown answer group IDs must be unique.';
    }

    const invalidIndex = payload.answer_groups.findIndex(
      (group) => !hasTranslation(group.display) || group.accepted_answers.length === 0
    );
    if (invalidIndex !== -1) {
      return `Countdown group ${invalidIndex + 1} needs a display label and at least one accepted answer.`;
    }
  }

  if (payload.type === 'clue_chain' && payload.accepted_answers.length === 0) {
    return 'Clue chain needs at least one accepted answer.';
  }

  if (payload.type === 'career_path' && payload.accepted_answers.length === 0) {
    return 'Career path needs at least one accepted answer.';
  }

  if (payload.type === 'football_logic' && payload.accepted_answers.length === 0) {
    return 'Football logic needs at least one accepted answer.';
  }

  return null;
}
