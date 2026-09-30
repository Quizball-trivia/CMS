import { describe, expect, it } from 'vitest';
import { contractProblems, createHarness, type Credentials, type Role } from './api-harness';
import { apiScenarios } from './api-scenarios';

/**
 * Opt-in: the same scenarios against a running Table Derby API, so the mock
 * and the real API are held to the same behaviour. Point it at a LOCAL API on
 * its own database only (the scenarios write content and publish):
 *   TD_REAL_API_URL=http://127.0.0.1:8090 TD_REAL_STAFF='{"editor":{"email":…,"password":…},"publisher":…,"betsson_admin":…,"ops":…}' npx vitest run real-api
 */
const url = process.env.TD_REAL_API_URL;
const staff = process.env.TD_REAL_STAFF;

describe.skipIf(!url || !staff)('real Table Derby admin API', () => {
  const harness = createHarness(
    (input, init) => fetch(input, init),
    url!,
    JSON.parse(staff ?? '{}') as Record<Role, Credentials>,
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    true,
  );
  apiScenarios(() => harness);

  it('answers every exchange as the pinned contract says', () => {
    expect(harness.exchanges.flatMap(contractProblems)).toEqual([]);
  });
}, 120_000);
