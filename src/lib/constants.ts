export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

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
  input_text: 'Text Input',
};

export const ACTIVITY_ALLOWED_EMAIL = 'bighead@quizball.com';

export const AUTH_TOKEN_KEY = 'quizball_auth_token';
export const REFRESH_TOKEN_KEY = 'quizball_refresh_token';
export const AUTH_EXPIRY_KEY = 'quizball_auth_expires_at';
