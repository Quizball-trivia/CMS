import type { components } from './api.generated';
import type { I18nField } from './category';

// Re-export enums from generated types - these stay in sync with backend
type QuestionResponseType = components['schemas']['QuestionResponse'];
export type QuestionType = QuestionResponseType['type'];
export type Difficulty = QuestionResponseType['difficulty'];
export type QuestionStatus = QuestionResponseType['status'];

// Payload types (not in OpenAPI yet - specific to question types)
export interface McqOption {
  id: string;
  text: I18nField;
  is_correct: boolean;
}

export interface McqPayload {
  type: 'mcq_single';
  options: McqOption[];
}

export interface TextInputPayload {
  type: 'input_text';
  accepted_answers: I18nField[];
  case_sensitive: boolean;
}

export type QuestionPayload = McqPayload | TextInputPayload;

// Extend the generated type with proper payload typing
export interface Question extends Omit<components['schemas']['QuestionResponse'], 'payload'> {
  payload: QuestionPayload | null;
}

export interface CreateQuestionRequest {
  category_id: string;
  type: QuestionType;
  difficulty: Difficulty;
  status?: QuestionStatus;
  prompt: I18nField;
  explanation?: I18nField | null;
  payload?: QuestionPayload;
}

export interface UpdateQuestionRequest {
  category_id?: string;
  type?: QuestionType;
  difficulty?: Difficulty;
  status?: QuestionStatus;
  prompt?: I18nField;
  explanation?: I18nField | null;
  payload?: QuestionPayload;
}

export interface ListQuestionsParams {
  category_id?: string;
  status?: QuestionStatus;
  difficulty?: Difficulty;
  type?: QuestionType;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateQuestionStatusRequest {
  status: QuestionStatus;
}

// Paginated response from generated types
export type PaginatedQuestionsResponse = components['schemas']['PaginatedQuestionsResponse'];
