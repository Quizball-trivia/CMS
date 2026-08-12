export type QuizPageCategory = 'team' | 'league' | 'quiz_type' | 'article';
export type QuizPageStatus = 'draft' | 'preview' | 'published' | 'archived';
export type QuizPageLocaleMode = 'en_only' | 'en_ka';
export type QuizQuestionSource = 'existing' | 'manual';

export interface QuizManualQuestion {
  id?: string;
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard';
  options: [string, string, string, string];
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string | null;
}

export interface QuizAboutBlock {
  id: string;
  type: 'paragraph' | 'bullet';
  text: string;
}

export interface QuizPageListItem {
  slug: string;
  internal_name: string;
  category: QuizPageCategory;
  status: QuizPageStatus;
  question_count: number;
  hero_image_url: string | null;
  locale_mode: QuizPageLocaleMode;
  scheduled_publish_at: string | null;
  published_at: string | null;
  updated_at: string;
  hub_order: number;
  is_hub_pinned: boolean;
}

export interface QuizQuestionSet {
  slug: string;
  name: string;
  count: number;
  easy: number;
  medium: number;
  hard: number;
  public_only: boolean;
}

export interface QuizPageInput {
  internal_name: string;
  slug: string;
  category: QuizPageCategory;
  h1: string;
  lede: string;
  question_source: QuizQuestionSource;
  question_set_slug: string;
  manual_questions: QuizManualQuestion[];
  about_heading: string;
  about_blocks: QuizAboutBlock[];
  score_cta: string;
  footer_banner_text: string;
  footer_button_label: string;
  related_slugs: string[];
  hero_image_url: string | null;
  hero_image_alt: string;
  seo_title: string;
  meta_description: string;
  og_image_url: string | null;
  og_image_alt: string | null;
  breadcrumb_label: string;
  locale_mode: QuizPageLocaleMode;
  ka_seo_title: string | null;
  ka_meta_description: string | null;
  ka_h1: string | null;
  ka_lede: string | null;
}

export interface QuizPage extends QuizPageInput {
  status: QuizPageStatus;
  question_count: number;
  scheduled_publish_at: string | null;
  published_at: string | null;
  updated_at: string;
  preview_token: string;
  preview_url: string;
  warnings: string[];
}

export interface QuizPageListFilters {
  status?: QuizPageStatus;
  category?: QuizPageCategory;
  search?: string;
}

export interface QuizPageRetireInput {
  route_mode: 'redirect' | 'gone';
  target_slug?: string | null;
}

export interface QuizPageRevision {
  id: number;
  revision_number: number;
  action: 'created' | 'saved' | 'previewed' | 'published' | 'scheduled' | 'unpublished' | 'restored';
  created_at: string;
  created_by: string | null;
  editor_name: string | null;
  summary: {
    internal_name: string;
    h1: string;
    status: string;
    question_count: number;
  };
}

export interface QuizPageGooglebotInspection {
  url: string;
  fetched_at: string;
  status_code: number;
  html: string;
  checks: Array<{
    key: string;
    label: string;
    passed: boolean;
    detail: string;
  }>;
}

export interface QuizPageSearchConsoleMetrics {
  configured: boolean;
  reason: string | null;
  property: string | null;
  start_date: string | null;
  end_date: string | null;
  pages: Array<{
    slug: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number | null;
  }>;
}

export interface QuizPageHubOrderInput {
  items: Array<{
    slug: string;
    hub_order: number;
    is_pinned: boolean;
  }>;
}

export const EMPTY_QUIZ_PAGE: QuizPageInput = {
  internal_name: '',
  slug: '',
  category: 'team',
  h1: '',
  lede: '',
  question_source: 'existing',
  question_set_slug: '',
  manual_questions: [],
  about_heading: '',
  about_blocks: [{ id: 'intro', type: 'paragraph', text: '' }],
  score_cta: 'You scored {score} — sign up free to save your score and defend it in a ranked duel.',
  footer_banner_text: '',
  footer_button_label: 'Sign up free',
  related_slugs: [],
  hero_image_url: null,
  hero_image_alt: '',
  seo_title: '',
  meta_description: '',
  og_image_url: null,
  og_image_alt: null,
  breadcrumb_label: '',
  locale_mode: 'en_only',
  ka_seo_title: null,
  ka_meta_description: null,
  ka_h1: null,
  ka_lede: null,
};
