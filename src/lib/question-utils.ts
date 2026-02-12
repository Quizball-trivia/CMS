import type { Question, QuestionStatus, AnswerWithId } from '@/types';

export interface QuestionFormData {
  category_id: string;
  locale: 'en' | 'ka';
  difficulty: 'easy' | 'medium' | 'hard';
  status: QuestionStatus;
  type: 'mcq_single' | 'input_text';
  prompt: string;
  explanation: string;
  options: Array<{ id?: string; text: string; is_correct: boolean }>;
  acceptedAnswers: AnswerWithId[];
  caseSensitive: boolean;
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
    };
  }

  // Fallback (shouldn't happen with valid data)
  return {
    ...baseData,
    options: [],
    acceptedAnswers: [],
  };
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
