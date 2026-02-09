import { API_BASE_URL, AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/lib/constants';
import { logger } from '@/lib/logger';
import type { ApiError } from '@/types';

const DEFAULT_TIMEOUT_MS = 120000; // 120 seconds (2 minutes) - increased for bulk operations

// Promise to track ongoing token refresh (allows concurrent requests to wait)
let refreshPromise: Promise<boolean> | null = null;

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

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function clearAuthTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      if (data.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      }
      logger.info('api', 'Token refreshed successfully');
      return true;
    }
  } catch (error) {
    logger.error('api', 'Token refresh error', { error: error instanceof Error ? error.message : String(error) });
  }

  return false;
}

/**
 * Attempt to refresh token, coordinating concurrent requests.
 * Only one refresh happens at a time - other requests wait for it.
 */
async function refreshTokenIfNeeded(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (refreshPromise) {
    return refreshPromise;
  }

  // Start new refresh
  refreshPromise = tryRefreshToken().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function handleResponseError(response: Response): ApiClientError {
  // This is called when we can't/won't retry
  return new ApiClientError(
    {
      code: 'NETWORK_ERROR',
      message: `Request failed with status ${response.status}`,
      details: null,
      request_id: null,
    },
    response.status
  );
}

async function parseResponse<T>(response: Response): Promise<T> {
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

/**
 * Execute a request with automatic token refresh and retry on 401.
 */
async function executeWithRetry<T>(
  requestFn: () => Promise<Response>,
  endpoint: string
): Promise<T> {
  const response = await requestFn();

  // If 401 and not an auth endpoint, try to refresh and retry
  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    logger.debug('api', 'Got 401, attempting token refresh', { endpoint });

    const refreshed = await refreshTokenIfNeeded();

    if (refreshed) {
      // Retry the original request with new token
      logger.debug('api', 'Retrying request after token refresh', { endpoint });
      const retryResponse = await requestFn();
      return parseResponse<T>(retryResponse);
    } else {
      // Refresh failed - clear session
      logger.info('api', 'Token refresh failed, clearing session');
      clearAuthTokens();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session-expired'));
      }
      throw handleResponseError(response);
    }
  }

  return parseResponse<T>(response);
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
      return await executeWithRetry<T>(
        () => fetch(buildUrl(endpoint, params), {
          method: 'GET',
          headers: getHeaders(),
          signal: timeoutSignal,
        }),
        endpoint
      );
    } finally {
      cleanup();
    }
  },

  async post<T>(
    endpoint: string,
    data?: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      options?.signal
    );

    try {
      return await executeWithRetry<T>(
        () => fetch(buildUrl(endpoint), {
          method: 'POST',
          headers: getHeaders(),
          body: data ? JSON.stringify(data) : undefined,
          signal: timeoutSignal,
        }),
        endpoint
      );
    } finally {
      cleanup();
    }
  },

  async put<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      return await executeWithRetry<T>(
        () => fetch(buildUrl(endpoint), {
          method: 'PUT',
          headers: getHeaders(),
          body: data ? JSON.stringify(data) : undefined,
          signal: timeoutSignal,
        }),
        endpoint
      );
    } finally {
      cleanup();
    }
  },

  async patch<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      return await executeWithRetry<T>(
        () => fetch(buildUrl(endpoint), {
          method: 'PATCH',
          headers: getHeaders(),
          body: data ? JSON.stringify(data) : undefined,
          signal: timeoutSignal,
        }),
        endpoint
      );
    } finally {
      cleanup();
    }
  },

  async delete<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      return await executeWithRetry<T>(
        () => fetch(buildUrl(endpoint), {
          method: 'DELETE',
          headers: getHeaders(),
          signal: timeoutSignal,
        }),
        endpoint
      );
    } finally {
      cleanup();
    }
  },

  // Special method for auth that doesn't include auth header (no retry needed)
  async postNoAuth<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

    try {
      const response = await fetch(buildUrl(endpoint), {
        method: 'POST',
        headers: getHeaders(false),
        body: data ? JSON.stringify(data) : undefined,
        signal: timeoutSignal,
      });
      return await parseResponse<T>(response);
    } finally {
      cleanup();
    }
  },
};
