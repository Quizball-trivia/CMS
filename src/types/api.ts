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
