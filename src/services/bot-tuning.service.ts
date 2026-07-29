/**
 * Client for the bot live-tuning surface.
 *
 * Unlike the other services these calls do NOT go through `apiClient`: that
 * points at the backend's API_BASE_URL and attaches the CMS Bearer session,
 * whereas the tuning routes need the ops shared secret. They are proxied
 * same-origin through /api/bot-tuning (see app/api/bot-tuning/route.ts), which
 * injects the token server-side.
 */

import { ApiClientError } from './api-client';
import { AUTH_TOKEN_KEY } from '@/lib/constants';
import type { ApiError } from '@/types';
import type {
  BotAdminEditsResponse,
  BotRosterPage,
  BotRosterQuery,
  BotRosterRow,
  BotTuningResponse,
  PatchBotRequest,
  PatchBotResponse,
  UpdateBotTuningRequest,
  ZeroOffsetsResponse,
} from '@/types';

const PROXY_BASE = '/api/bot-tuning';

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let error: ApiError;
    try {
      error = (await response.json()) as ApiError;
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
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // The proxy verifies this session belongs to an admin before forwarding
  // with the server-side ops token.
  const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const response = await fetch(`${PROXY_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  return parse<T>(response);
}

export const botTuningService = {
  async getTuning(): Promise<BotTuningResponse> {
    return request<BotTuningResponse>('');
  },

  async updateTuning(data: UpdateBotTuningRequest): Promise<BotTuningResponse> {
    return request<BotTuningResponse>('', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getRoster(query: BotRosterQuery = {}): Promise<BotRosterPage> {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    if (query.search) params.set('search', query.search);
    if (query.frozen !== undefined) params.set('frozen', String(query.frozen));
    if (query.sort) params.set('sort', query.sort);
    if (query.direction) params.set('direction', query.direction);
    const qs = params.toString();
    return request<BotRosterPage>(`/roster${qs ? `?${qs}` : ''}`);
  },

  async setFrozen(botUserId: string, frozen: boolean, reason?: string): Promise<BotRosterRow> {
    return request<BotRosterRow>(`/roster/${botUserId}/freeze`, {
      method: 'POST',
      body: JSON.stringify(reason ? { frozen, reason } : { frozen }),
    });
  },

  /**
   * Edit one bot. Send only the fields being changed; `note` is mandatory and
   * is what the server records in the audit trail.
   */
  async patchBot(botUserId: string, data: PatchBotRequest): Promise<PatchBotResponse> {
    return request<PatchBotResponse>(`/roster/${botUserId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Recent admin edits for one bot, newest first. */
  async getBotHistory(botUserId: string): Promise<BotAdminEditsResponse> {
    return request<BotAdminEditsResponse>(`/roster/${botUserId}/history`);
  },

  /** Emergency: clears every live governor offset. Requires confirm: true. */
  async zeroGovernorOffsets(reason?: string): Promise<ZeroOffsetsResponse> {
    return request<ZeroOffsetsResponse>('/governor/zero-offsets', {
      method: 'POST',
      body: JSON.stringify(reason ? { confirm: true, reason } : { confirm: true }),
    });
  },
};
