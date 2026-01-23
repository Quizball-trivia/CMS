import type { I18nField } from './category';

export type QuestionType = 'mcq_single' | 'input_text';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionStatus = 'draft' | 'published' | 'archived';

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

export interface Question {
  id: string;
  category_id: string;
  type: QuestionType;
  difficulty: Difficulty;
  status: QuestionStatus;
  prompt: I18nField;
  explanation: I18nField | null;
  created_at: string;
  updated_at: string;
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
