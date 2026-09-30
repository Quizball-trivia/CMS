import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TD_CONTRACT } from '../contract';
import cases from '../contract/pinned/fixtures/validation-cases.json';
import { validateSchema } from '../contract/validate';

/**
 * Opt-in: the validator against Ajv (strict JSON Schema 2020-12, as the API's
 * own parity test runs it) and against the API's own zod schemas, on
 * thousands of values mutated from the pinned cases, beyond the cases
 * themselves. Neither is a dependency of this repo, so both are loaded from a
 * Table Derby checkout:
 *   TD_CONTRACTS_DIR=<table-derby>/packages/contracts npx vitest run contract-oracle
 */
const dir = process.env.TD_CONTRACTS_DIR;

function mutations(value: unknown, extraProbes: unknown[] = []): unknown[] {
  const out: unknown[] = [];
  const probes = [null, '', ' padded ', 0, -1, 0.5, 1e12, true, [], {}, 'x'.repeat(301), '😀'.repeat(201), 'a-b', 'A', ...extraProbes];
  const walk = (current: unknown, replace: (next: unknown) => unknown, depth: number) => {
    if (depth > 3) return;
    for (const probe of probes) out.push(replace(probe));
    if (Array.isArray(current)) {
      out.push(replace([]), replace([...current, ...current]), replace(current.slice(1)));
      current.forEach((item, i) =>
        walk(item, (next) => replace(current.map((x, j) => (j === i ? next : x))), depth + 1),
      );
    } else if (current && typeof current === 'object') {
      const record = current as Record<string, unknown>;
      out.push(replace({ ...record, unexpected: 1 }));
      for (const key of Object.keys(record)) {
        const rest = { ...record };
        delete rest[key];
        out.push(replace(rest));
        walk(record[key], (next) => replace({ ...record, [key]: next }), depth + 1);
      }
    }
  };
  walk(value, (next) => next, 0);
  return out;
}

describe.skipIf(!dir)('contract validator against Ajv', () => {
  it('gives the same verdict as Ajv on mutated values of every schema', () => {
    const require = createRequire(join(dir!, 'package.json'));
    const Ajv2020 = require('ajv/dist/2020').default as new (options: object) => { compile(schema: object): (value: unknown) => boolean };
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validators = new Map(Object.entries(TD_CONTRACT.schemas).map(([name, schema]) => [name, ajv.compile(schema)]));
    let compared = 0;
    const disagreements: string[] = [];
    for (const c of cases.cases) {
      for (const value of [c.value, ...mutations(c.value)]) {
        compared++;
        const ours = validateSchema(TD_CONTRACT.schemas[c.schema], value).length === 0;
        const theirs = validators.get(c.schema)!(value);
        if (ours !== theirs && disagreements.length < 20) disagreements.push(`${c.schema} ${JSON.stringify(value).slice(0, 200)}: ours ${ours}, Ajv ${theirs}`);
      }
    }
    expect(disagreements).toEqual([]);
    expect(compared).toBeGreaterThan(50_000);
  });

  it('gives the same verdict as the API’s zod schemas, image URLs in UTF-16 units included', () => {
    // Node's own loader (it strips the types), not Vite's: the checkout is outside this project.
    const { ADMIN_SCHEMAS } = createRequire(join(dir!, 'package.json'))('./src/adminContract.ts') as {
      ADMIN_SCHEMAS: Record<string, { schema: { safeParse(value: unknown): { success: boolean } } }>;
    };
    // Where the API's regex has no `u` flag (the artifact says it has), zod is the API's verdict, not Ajv.
    const urls = [`https://x.test/${'😀'.repeat(1000)}`, `https://x.test/${'😀'.repeat(1500)}`, `/${'😀'.repeat(1500)}`, `/${'😀'.repeat(1019)}`, `/${'😀'.repeat(1020)}`];
    let compared = 0;
    const disagreements: string[] = [];
    for (const c of cases.cases) {
      for (const value of [c.value, ...mutations(c.value, urls)]) {
        compared++;
        const ours = validateSchema(TD_CONTRACT.schemas[c.schema], value).length === 0;
        const api = ADMIN_SCHEMAS[c.schema]!.schema.safeParse(value).success;
        if (ours !== api && disagreements.length < 20) disagreements.push(`${c.schema} ${JSON.stringify(value).slice(0, 200)}: ours ${ours}, API ${api}`);
      }
    }
    expect(disagreements).toEqual([]);
    expect(compared).toBeGreaterThan(50_000);
  });
});
