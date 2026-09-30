import { describe, expect, it } from 'vitest';
import { matchContractRoute, TD_CONTRACT } from '../contract';
import { memoryBlobStore } from '../mock/blob-store';
import { createMockTdApi, MOCK_PASSWORD, MOCK_STAFF } from '../mock-api';
import { contractProblems, createHarness, type Role } from './api-harness';
import { apiScenarios } from './api-scenarios';
import { MemoryStorage } from './helpers';

/** Team management and password changes belong to the Team tab and sign-in, not to these tabs. */
const NOT_MOCKED = new Set(['POST /admin/auth/password', 'POST /admin/staff/invite', 'PATCH /admin/staff/:id', 'POST /admin/staff/:id/reset-link']);

const storage = new MemoryStorage();
// Noon in Georgia: far from the tickets-per-day midnight guard.
let clock = Date.parse('2026-09-30T08:00:00Z');
const fetchMock = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => clock, blobs: memoryBlobStore(), lock: undefined });
const credentials = Object.fromEntries(
  (['editor', 'publisher', 'betsson_admin', 'ops'] as Role[]).map((role) => [role, { email: MOCK_STAFF.find((s) => s.role === role && s.status === 'active')!.email, password: MOCK_PASSWORD }]),
) as Record<Role, { email: string; password: string }>;
const harness = createHarness(fetchMock, 'https://td-api.mock', credentials, async (ms) => void (clock += ms), false);

describe('mock Table Derby admin API', () => {
  apiScenarios(() => harness);

  it('answers every exchange as the pinned contract says (body schemas, refusal codes per route)', () => {
    expect(harness.exchanges.length).toBeGreaterThan(150);
    expect(harness.exchanges.flatMap(contractProblems)).toEqual([]);
  });

  it('was driven through every route the tabs use', () => {
    const hit = new Set(
      harness.exchanges.map((e) => {
        const matched = matchContractRoute(e.method, e.path.split('?')[0]);
        return matched ? `${matched.route.method} ${matched.route.path}` : `${e.method} ${e.path}`;
      }),
    );
    const missing = TD_CONTRACT.routes
      .filter((route) => route.auth === 'staff' && !NOT_MOCKED.has(`${route.method} ${route.path}`))
      .map((route) => `${route.method} ${route.path}`)
      .filter((route) => !hit.has(route));
    expect(missing).toEqual([]);
  });
});
