import { API_BASE_URL, AUTH_TOKEN_KEY } from '@/lib/constants';
import type { ApiError } from '@/types';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

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

function createTimeoutController(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  existingSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  // If existing signal is already aborted, abort immediately
  if (existingSignal?.aborted) {
    controller.abort(existingSignal.reason);
    return { signal: controller.signal, cleanup: () => {} };
  }

  // Set up timeout
  const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);

  // If existing signal is provided, listen for its abort
  const abortHandler = () => controller.abort(existingSignal?.reason);
  if (existingSignal) {
    existingSignal.addEventListener('abort', abortHandler);
  }

  // Cleanup function to clear timeout and listeners
  const cleanup = () => {
    clearTimeout(timeoutId);
    if (existingSignal) {
      existingSignal.removeEventListener('abort', abortHandler);
    }
  };

  return { signal: controller.signal, cleanup };
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let error: ApiError;
    try {
      error = await response.json() as ApiError;
    } catch {
      error = {
        code: 'NETWORK_ERROR',
        message: `Request failed with status ${response.status}`,
        details: null,
        request_id: null,
      };
    }
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
  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    signal?: AbortSignal
  ): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      const response = await fetch(buildUrl(endpoint, params), {
        method: 'GET',
        headers: getHeaders(),
        signal: timeoutSignal,
      });
      return await handleResponse<T>(response);
    } finally {
      cleanup();
    }
  },

  async post<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      const response = await fetch(buildUrl(endpoint), {
        method: 'POST',
        headers: getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
        signal: timeoutSignal,
      });
      return await handleResponse<T>(response);
    } finally {
      cleanup();
    }
  },

  async put<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      const response = await fetch(buildUrl(endpoint), {
        method: 'PUT',
        headers: getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
        signal: timeoutSignal,
      });
      return await handleResponse<T>(response);
    } finally {
      cleanup();
    }
  },

  async patch<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      const response = await fetch(buildUrl(endpoint), {
        method: 'PATCH',
        headers: getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
        signal: timeoutSignal,
      });
      return await handleResponse<T>(response);
    } finally {
      cleanup();
    }
  },

  async delete<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      const response = await fetch(buildUrl(endpoint), {
        method: 'DELETE',
        headers: getHeaders(),
        signal: timeoutSignal,
      });
      return await handleResponse<T>(response);
    } finally {
      cleanup();
    }
  },

  // Special method for auth that doesn't include auth header
  async postNoAuth<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      const response = await fetch(buildUrl(endpoint), {
        method: 'POST',
        headers: getHeaders(false),
        body: data ? JSON.stringify(data) : undefined,
        signal: timeoutSignal,
      });
      return await handleResponse<T>(response);
    } finally {
      cleanup();
    }
  },
};
