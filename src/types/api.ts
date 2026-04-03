export interface ApiError {
  code: string;
  message: string;
  details: unknown;
  request_id: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface AuthUser {
  email: string | null;
  provider_sub: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// Actual response from the backend /auth/login endpoint
export interface LoginResponse {
  access_token: string | null;
  refresh_token: string | null;
  expires_in: number | null;
  token_type: string;
  user: AuthUser | null;
  provider: string;
}

// Activity Dashboard types
export interface DayActivity {
  date: string;
  questions_created: number;
  categories_created: number;
  total: number;
  question_categories: DailyQuestionCategoryCount[];
}

export interface DailyQuestionCategoryCount {
  id: string | null;
  name: string;
  count: number;
}

export interface ActionCounts {
  [action: string]: number;
}

export interface ActivitySummary {
  total_questions: number;
  total_categories: number;
  active_days: number;
  actions: ActionCounts;
}

export interface ActivityResponse {
  days: DayActivity[];
  summary: ActivitySummary;
}

export interface ActivityUser {
  id: string;
  email: string;
}

export interface ActivityUsersResponse {
  users: ActivityUser[];
}

export interface CategoryBreakdownItem {
  id: string;
  name: string;
  question_count: number;
  is_active: boolean;
  last_question_created_at: string | null;
}

export interface CategoryBreakdownResponse {
  categories: CategoryBreakdownItem[];
}

export interface RecentActivityItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface RecentActivityResponse {
  items: RecentActivityItem[];
}

// User profile from /users/me endpoint
export interface User {
  id: string;
  email: string | null;
  nickname: string | null;
  country: string | null;
  avatar_url: string | null;
  role?: string;
  onboarding_complete: boolean;
  created_at: string;
}
