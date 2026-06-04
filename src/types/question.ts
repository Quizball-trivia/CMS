import type { components } from './api.generated';
import type { I18nField } from './category';

// Re-export enums from generated types - these stay in sync with backend
type QuestionResponseType = components['schemas']['QuestionResponse'];
export type QuestionType =
  | QuestionResponseType['type']
  | 'true_false'
  | 'countdown_list'
  | 'clue_chain'
  | 'put_in_order'
  | 'imposter_multi_select'
  | 'career_path'
  | 'high_low'
  | 'football_logic';
export type Difficulty = QuestionResponseType['difficulty'];
export type QuestionStatus = QuestionResponseType['status'];

export interface McqOption {
  id: string;
  text: I18nField;
  is_correct: boolean;
}

export interface McqImage {
  url: string;
  width: number;
  height: number;
  aspect_ratio?: string;
  source_url?: string | null;
  title?: string | null;
  author?: string | null;
  license?: string | null;
  license_url?: string | null;
  provider?: string | null;
}

// Extended I18nField with stable ID for React keys (UI-only, stripped when sending to API)
export interface AnswerWithId extends I18nField {
  id: string;
}

export interface McqPayload {
  type: 'mcq_single';
  image?: McqImage;
  options: McqOption[];
}

export interface TextInputPayload {
  type: 'input_text';
  accepted_answers: I18nField[];
  case_sensitive: boolean;
}

export interface TrueFalsePayload {
  type: 'true_false';
  options: [
    { id: 'true'; text: I18nField; is_correct: boolean },
    { id: 'false'; text: I18nField; is_correct: boolean },
  ];
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
  direction: 'asc' | 'desc';
  items: Array<{
    id: string;
    label: I18nField;
    details?: I18nField | null;
    emoji?: string | null;
    sort_value: number;
  }>;
}

export interface ImposterMultiSelectPayload {
  type: 'imposter_multi_select';
  options: McqOption[];
}

export interface CareerPathPayload {
  type: 'career_path';
  clubs: I18nField[];
  display_answer: I18nField;
  accepted_answers: string[];
}

export interface HighLowPayload {
  type: 'high_low';
  stat_label: I18nField;
  matchups: Array<{
    id: string;
    left_name: I18nField;
    left_value: number;
    right_name: I18nField;
    right_value: number;
  }>;
}

export interface FootballLogicPayload {
  type: 'football_logic';
  image_a_url: string;
  image_b_url: string;
  display_answer: I18nField;
  accepted_answers: string[];
  prompt?: I18nField;
  explanation?: I18nField | null;
}

export type QuestionPayload =
  | McqPayload
  | TrueFalsePayload
  | TextInputPayload
  | CountdownPayload
  | ClueChainPayload
  | PutInOrderPayload
  | ImposterMultiSelectPayload
  | CareerPathPayload
  | HighLowPayload
  | FootballLogicPayload;

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
  mcq_image?: 'with' | 'without';
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateQuestionStatusRequest {
  status: QuestionStatus;
}

export interface DeleteQuestionResult {
  action: 'deleted' | 'archived';
  entity_type: 'question';
  entity_id: string;
  message: string;
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

export interface GeneratedImageMcqImage {
  data_url: string;
  width: number;
  height: number;
  aspect_ratio: string;
  source_url: string;
  title: string;
  author: string | null;
  license: string | null;
  license_url: string | null;
  provider: string;
}

export interface GeneratedImageMcqCard {
  id: string;
  category_id: string;
  category_slug: string;
  category_name: string;
  prompt: I18nField;
  difficulty: Difficulty;
  options: McqOption[];
  explanation: I18nField;
  confidence: number;
  image: GeneratedImageMcqImage;
}

export interface GenerateImageMcqPreviewRequest {
  category_ids?: string[];
  limit_categories?: number;
  images_per_category?: number;
  questions_per_image?: number;
  image_width?: number;
  image_height?: number;
  model?: string;
}

export interface GenerateImageMcqPreviewResponse {
  cards: GeneratedImageMcqCard[];
  skipped: Array<{
    category_id: string;
    category_slug: string;
    reason: string;
  }>;
}

export interface GenerateImageMcqProgressEvent {
  type: 'progress';
  stage:
    | 'started'
    | 'category_started'
    | 'commons_search'
    | 'candidates_selected'
    | 'candidate_started'
    | 'image_normalized'
    | 'openrouter_started'
    | 'openrouter_completed'
    | 'candidate_completed'
    | 'candidate_skipped'
    | 'category_completed'
    | 'completed';
  message: string;
  completed_images: number;
  total_images: number;
  cards_generated: number;
  target_cards: number;
  current_category?: string;
  current_image_title?: string;
}

export interface SaveImageMcqDraftsRequest {
  cards: GeneratedImageMcqCard[];
  translate_to_ka?: boolean;
}

export interface SaveImageMcqDraftsResponse {
  total: number;
  successful: number;
  failed: number;
  created: Question[];
  errors: Array<{
    index: number;
    error: string;
  }>;
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
