import type { components } from './api.generated';
import type { I18nField } from './category';

// Re-export enums from generated types - these stay in sync with backend
type QuestionResponseType = components['schemas']['QuestionResponse'];
export type QuestionType =
  | QuestionResponseType['type']
  | 'countdown_list'
  | 'clue_chain'
  | 'put_in_order';
export type Difficulty = QuestionResponseType['difficulty'];
export type QuestionStatus = QuestionResponseType['status'];

export interface McqOption {
  id: string;
  text: I18nField;
  is_correct: boolean;
}

// Extended I18nField with stable ID for React keys (UI-only, stripped when sending to API)
export interface AnswerWithId extends I18nField {
  id: string;
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

export interface CountdownPayload {
  type: 'countdown_list';
  prompt: I18nField;
  answer_groups: Array<{
    id: string;
    display: I18nField;
    accepted_answers: string[];
  }>;
}

export interface ClueChainPayload {
  type: 'clue_chain';
  display_answer: I18nField;
  accepted_answers: string[];
  clues: Array<{
    type: 'text' | 'emoji';
    content: I18nField;
  }>;
}

export interface PutInOrderPayload {
  type: 'put_in_order';
  prompt: I18nField;
  direction: 'asc';
  items: Array<{
    id: string;
    label: I18nField;
    details?: I18nField | null;
    emoji?: string | null;
    sort_value: number;
  }>;
}

export type QuestionPayload =
  | McqPayload
  | TextInputPayload
  | CountdownPayload
  | ClueChainPayload
  | PutInOrderPayload;

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

// Bulk create types
export interface BulkCreateQuestionsRequest {
  category_id: string;
  questions: Omit<CreateQuestionRequest, 'category_id'>[];
}

export interface BulkCreateError {
  index: number;
  question: BulkCreateQuestionsRequest['questions'][number];
  error: string;
}

export interface BulkCreateResponse {
  total: number;
  successful: number;
  failed: number;
  created: Question[];
  errors: BulkCreateError[];
}

// Duplicate detection types - using generated types from OpenAPI
export type CategorySummary = components['schemas']['CategorySummary'];
export type DuplicateType = components['schemas']['DuplicateGroup']['type'];

// Extend generated DuplicateGroup with properly typed questions
export interface DuplicateGroup extends Omit<components['schemas']['DuplicateGroup'], 'questions'> {
  questions: Question[];
}

export interface FindDuplicatesParams {
  type?: DuplicateType;
  category_id?: string;
  include_drafts?: boolean;
}

export interface DuplicatesResponse {
  total_groups: number;
  groups: DuplicateGroup[];
}

// Check duplicates types (for bulk upload preview) - using generated types from OpenAPI
export type DuplicateQuestionInfo = components['schemas']['DuplicateQuestionInfo'];
export type CheckDuplicatesResponse = components['schemas']['CheckDuplicatesResponse'];

export interface CheckDuplicatesRequest {
  locale: string;
  prompts: I18nField[]; // Array of i18n field objects
}
