import { API_BASE_URL, AUTH_TOKEN_KEY } from '@/lib/constants';
import type { ApiError } from '@/types';

export class ApiClientError extends Error {
  public code: string;
  public details: unknown;
  public requestId: string | null;
  public status: number;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.request_id;
    this.status = status;
  }
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new ApiClientError(error, response.status);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE_URL}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

function getHeaders(includeAuth = true): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

export const apiClient = {
  async get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const response = await fetch(buildUrl(endpoint, params), {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse<T>(response);
  },

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(buildUrl(endpoint), {
      method: 'POST',
      headers: getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(buildUrl(endpoint), {
      method: 'PUT',
      headers: getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(buildUrl(endpoint), {
      method: 'PATCH',
      headers: getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(buildUrl(endpoint), {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse<T>(response);
  },

  // Special method for auth that doesn't include auth header
  async postNoAuth<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(buildUrl(endpoint), {
      method: 'POST',
      headers: getHeaders(false),
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },
};
