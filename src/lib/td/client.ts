import { createTdApiClient, createTransport, requestTokenRefresh } from './api-client';
import { createBrowserLock } from './cross-tab-lock';
import { resolveTdConfig } from './env';
import { createRefreshCoordinator } from './refresh-coordinator';
import { browserStorage, createTokenStore, TD_STORAGE_KEYS } from './token-store';

// Literal process.env reads: Next.js only inlines NEXT_PUBLIC_* written out in full.
export const TD_CONFIG = resolveTdConfig({
  NEXT_PUBLIC_CMS_WORKSPACE: process.env.NEXT_PUBLIC_CMS_WORKSPACE,
  NEXT_PUBLIC_CMS_ENV: process.env.NEXT_PUBLIC_CMS_ENV,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  NEXT_PUBLIC_TD_API_URL: process.env.NEXT_PUBLIC_TD_API_URL,
  NEXT_PUBLIC_TD_API_MOCK: process.env.NEXT_PUBLIC_TD_API_MOCK,
});

let mockFetch: Promise<typeof fetch> | null = null;

// The literal env comparison is folded at build time, so a real-API build
// drops this branch and never emits the mock chunk.
const fetchImpl: typeof fetch =
  process.env.NEXT_PUBLIC_TD_API_MOCK === '1' && TD_CONFIG.mock
    ? async (input, init) => {
        mockFetch ??= import('./mock-api').then(({ createMockTdApi }) => createMockTdApi({ storage: browserStorage }));
        return (await mockFetch)(input, init);
      }
    : (input, init) => fetch(input, init);

const transport = createTransport(TD_CONFIG.apiUrl, fetchImpl);

export const tdTokens = createTokenStore(browserStorage);

export const tdRefresh = createRefreshCoordinator({
  tokens: tdTokens,
  lock: createBrowserLock('td-refresh', TD_STORAGE_KEYS.refreshLock, browserStorage),
  requestRefresh: (refreshToken) => requestTokenRefresh(transport, refreshToken),
});

export const tdApi = createTdApiClient({ transport, tokens: tdTokens, coordinator: tdRefresh });
