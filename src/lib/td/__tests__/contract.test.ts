import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContract, matchContractRoute, TD_ADMIN_CONTRACT_VERSION, TD_CONTRACT } from '../contract';
import cases from '../contract/pinned/fixtures/validation-cases.json';
import { describePattern, unsupportedKeywords, validateSchema } from '../contract/validate';
import { verifyTdContractPin } from '../contract/verify-pin';

const CONTRACT_DIR = join(import.meta.dirname, '../contract');

describe('pinned admin contract', () => {
  it('matches pin.json byte for byte and is the version the client is written for', () => {
    const pin = verifyTdContractPin(CONTRACT_DIR);
    expect(pin.version).toBe(TD_ADMIN_CONTRACT_VERSION);
    expect(TD_CONTRACT.version).toBe(TD_ADMIN_CONTRACT_VERSION);
    expect(TD_CONTRACT.contract).toBe('table-derby-admin');
  });

  it('is v9: the dashboard has the last 7 and 30 days and a point per day; match inputs can be archived or expired; images need no rights; Football Logic takes uploaded images', () => {
    expect(TD_ADMIN_CONTRACT_VERSION).toBe(9);
    expect(TD_CONTRACT.version).toBe(9);
    expect((TD_CONTRACT.schemas.FootballLogicData as { required: string[] }).required).toEqual(expect.arrayContaining(['imageAKey', 'imageBKey']));
    const board = TD_CONTRACT.schemas.Dashboard as { required: string[] };
    expect(board.required).toEqual(expect.arrayContaining(['today', 'yesterday', 'last7Days', 'last30Days', 'days']));
    const record = TD_CONTRACT.schemas.AdminMatchRecord as { properties: { inputs: { properties: Record<string, { anyOf?: { enum?: string[] }[] }> } } };
    const inputs = record.properties.inputs;
    expect(inputs.properties.missing.anyOf?.[0].enum).toEqual(['redis_lost', 'never_started', 'not_recorded', 'archived', 'expired']);
    expect(Object.keys(inputs.properties)).toContain('archivedAt');
  });

  it('refuses an edited copy and a version the client is not written for', () => {
    const dir = mkdtempSync(join(tmpdir(), 'td-pin-'));
    try {
      cpSync(CONTRACT_DIR, dir, { recursive: true });
      expect(() => verifyTdContractPin(dir, TD_ADMIN_CONTRACT_VERSION + 1)).toThrow(new RegExp(`written for v${TD_ADMIN_CONTRACT_VERSION + 1}`));
      const file = join(dir, 'pinned/admin-contract.d.ts');
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n`);
      expect(() => verifyTdContractPin(dir)).toThrow(/admin-contract.d.ts does not match its pinned hash/);
      copyFileSync(join(CONTRACT_DIR, 'pinned/admin-contract.d.ts'), file);
      rmSync(join(dir, 'pinned/fixtures/examples.json'));
      expect(() => verifyTdContractPin(dir)).toThrow(/examples.json is missing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses no schema keyword the validator does not know', () => {
    const found = new Set<string>();
    for (const schema of Object.values(TD_CONTRACT.schemas)) unsupportedKeywords(schema, found);
    expect([...found]).toEqual([]);
  });

  it('carries a validation case for every schema', () => {
    expect(new Set(cases.cases.map((c) => c.schema))).toEqual(new Set(Object.keys(TD_CONTRACT.schemas)));
  });
});

describe('contract validator', () => {
  // The API's parity test runs these through zod and Ajv; the CMS must agree with both.
  for (const c of cases.cases) {
    it(`${c.schema}: ${c.valid ? 'accepts' : 'refuses'} ${c.why}`, () => {
      const issues = checkContract(c.schema, c.value);
      expect(issues.length === 0, JSON.stringify(issues)).toBe(c.valid);
    });
  }

  it('reports issues by path, as the API does', () => {
    const issues = checkContract('CardData', {
      categoryKey: 'legends',
      key: 'Bad Key',
      value: 4,
      lines: [' padded'],
      display: '',
      aliases: [],
      photo: null,
      imageKey: null,
      extra: true,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: 'key', message: expect.stringMatching(/^Lower-case letters/) },
        { path: 'value', message: 'One of: 1, 2, 3' },
        { path: 'lines.0', message: 'Required: at most 200 characters, with no spaces at the start or end' },
        { path: 'display', message: 'Required' },
        { path: 'aliases', message: 'Add at least one' },
        { path: 'extra', message: 'Not a field of this type' },
      ]),
    );
  });

  it('counts lengths in code points, like the API', () => {
    const schema = { type: 'string', pattern: '^[\\s\\S]{0,2}$' };
    expect(validateSchema(schema, '😀😀')).toEqual([]);
    expect(validateSchema(schema, '😀😀😀')).toHaveLength(1);
  });

  it('counts image URLs in code points, as the API’s regexes do (the u flag)', () => {
    const valid = (schema: string, field: string) => cases.cases.find((c) => c.schema === schema && c.valid && typeof (c.value as Record<string, unknown>)[field] === 'string')!.value as Record<string, unknown>;
    const media = valid('MediaData', 'url');
    const logic = valid('FootballLogicData', 'imageA');
    const check = (schema: string, value: Record<string, unknown>) => validateSchema(TD_CONTRACT.schemas[schema], value).length === 0;
    // 1,500 emoji: 3,000 UTF-16 units but 1,500 code points, within 2040.
    expect(check('MediaData', { ...media, url: `https://x.test/${'😀'.repeat(1500)}` })).toBe(true);
    expect(check('FootballLogicData', { ...logic, imageA: `/${'😀'.repeat(1500)}` })).toBe(true);
    expect(check('ContentImportItem', { type: 'football-logic', data: { ...logic, imageB: `https://x.test/${'😀'.repeat(1500)}` } })).toBe(true);
    // Past 2040 code points either way.
    expect(check('MediaData', { ...media, url: `https://x.test/${'😀'.repeat(2040)}` })).toBe(false);
    expect(check('FootballLogicData', { ...logic, imageA: `/${'😀'.repeat(2041)}` })).toBe(false);
  });

  it('names the pattern families in plain words', () => {
    expect(describePattern('^\\S(?:[\\s\\S]{0,298}\\S)?$')).toMatch(/at most 300 characters/);
    expect(describePattern('^(?:\\S(?:[\\s\\S]{0,998}\\S)?)?$')).toMatch(/^At most 1000 characters/);
    expect(describePattern('^[\\s\\S]{0,2000}$')).toBe('At most 2000 characters');
    expect(describePattern('^[a-z0-9-]{1,120}\\.webp$')).toMatch(/webp/);
  });

  it('explains a missing required nullable field and a wrong branch', () => {
    const issues = checkContract('MatchCorrectionRequest', { version: 1, outcome: { kind: 'win' }, reason: 'x' });
    expect(issues).toEqual([{ path: 'outcome.winner', message: 'Required' }]);
  });
});

describe('route matching', () => {
  it('finds the route and its parameters, literal paths first', () => {
    expect(matchContractRoute('POST', '/admin/content/imports/preview')?.route.path).toBe('/admin/content/imports/preview');
    expect(matchContractRoute('GET', '/admin/content/imports/abc')).toMatchObject({
      route: { path: '/admin/content/imports/:id' },
      params: { id: 'abc' },
    });
    expect(matchContractRoute('POST', '/admin/content/cards/r1/approve')).toMatchObject({
      route: { path: '/admin/content/cards/:id/approve', roles: ['publisher', 'betsson_admin', 'ops'] },
      params: { id: 'r1' },
    });
    expect(matchContractRoute('GET', '/admin/nothing')).toBeNull();
  });
});
