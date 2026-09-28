import { createTdApiClient, createTransport, requestTokenRefresh, requestTokenRevoke } from './api-client';
import { createBrowserLock, type CrossTabLock } from './cross-tab-lock';
import { resolveTdConfig } from './env';
import { createRefreshCoordinator } from './refresh-coordinator';
import { browserStorage, createTokenStore } from './token-store';

// Literal process.env reads: Next.js only inlines NEXT_PUBLIC_* written out in full.
export const TD_CONFIG = resolveTdConfig({
  NEXT_PUBLIC_CMS_WORKSPACE: process.env.NEXT_PUBLIC_CMS_WORKSPACE,
  NEXT_PUBLIC_CMS_ENV: process.env.NEXT_PUBLIC_CMS_ENV,
  NEXT_PUBLIC_TD_API_URL: process.env.NEXT_PUBLIC_TD_API_URL,
  NEXT_PUBLIC_TD_API_MOCK: process.env.NEXT_PUBLIC_TD_API_MOCK,
});

let mockFetch: Promise<typeof fetch> | null = null;

// next.config.ts always defines the flag and the build rejects anything but
// "1"/"0"/unset, so this comparison is folded at build time and a real-API
// build drops the branch and never emits the mock chunk.
const fetchImpl: typeof fetch =
  process.env.NEXT_PUBLIC_TD_API_MOCK === '1' && TD_CONFIG.mock
    ? async (input, init) => {
        mockFetch ??= import('./mock-api').then(({ createMockTdApi }) => createMockTdApi({ storage: browserStorage }));
        return (await mockFetch)(input, init);
      }
    : (input, init) => fetch(input, init);

const transport = createTransport(TD_CONFIG.apiUrl, fetchImpl);

const locks = new Map<string, CrossTabLock | null>();
function browserLock(name: string): CrossTabLock | null {
  if (!locks.has(name)) locks.set(name, createBrowserLock(name));
  return locks.get(name) ?? null;
}

/** Short critical sections: every read-compare-write of the stored session. */
export const tdSessionLock = () => browserLock('td-session');
/** Held while a refresh token is spent over the network; never needed to sign in or out. */
export const tdRefreshLock = () => browserLock('td-refresh');

export const tdTokens = createTokenStore(browserStorage, tdSessionLock);

export const tdRefresh = createRefreshCoordinator({
  tokens: tdTokens,
  refreshLock: tdRefreshLock,
  requestRefresh: (refreshToken, requestId) => requestTokenRefresh(transport, refreshToken, requestId),
  revoke: (refreshToken) => requestTokenRevoke(transport, refreshToken),
});

export const tdApi = createTdApiClient({ transport, tokens: tdTokens, coordinator: tdRefresh });
