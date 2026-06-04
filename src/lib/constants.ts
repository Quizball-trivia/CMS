function normalizeApiBaseUrl(rawUrl: string): string {
  const url = rawUrl.trim().replace(/\/+$/, '');
  return url.endsWith('/api/v1') ? url : `${url}/api/v1`;
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1'
);

export const SUPPORTED_LANGUAGES = ['en', 'ka'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const QUESTION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq_single: 'Multiple Choice',
  true_false: 'True / False',
  input_text: 'Text Input',
  countdown_list: 'Countdown',
  clue_chain: 'Who Am I',
  put_in_order: 'Put In Order',
  imposter_multi_select: 'Imposter Multi Select',
  career_path: 'Career Path',
  high_low: 'High Low',
  football_logic: 'Football Logic',
};

export const ACTIVITY_ALLOWED_EMAIL = 'bighead@quizball.com';

export const AUTH_TOKEN_KEY = 'quizball_auth_token';
export const REFRESH_TOKEN_KEY = 'quizball_refresh_token';
export const AUTH_EXPIRY_KEY = 'quizball_auth_expires_at';
