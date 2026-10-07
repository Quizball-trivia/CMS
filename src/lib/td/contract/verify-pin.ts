// Imported by next.config.ts, so node built-ins and relative imports only.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TD_ADMIN_CONTRACT_VERSION } from './version';

interface Pin {
  contract: string;
  version: number;
  files: Record<string, string>;
}

/**
 * Refuses a pinned contract that is not the one pin.json describes, byte for
 * byte, or not the version the client is written against. `dir` is
 * src/lib/td/contract. Throws with every mismatch named.
 */
export function verifyTdContractPin(dir: string, expectedVersion: number = TD_ADMIN_CONTRACT_VERSION): Pin {
  const pin = JSON.parse(readFileSync(join(dir, 'pin.json'), 'utf8')) as Pin;
  const problems: string[] = [];
  if (pin.contract !== 'table-derby-admin') problems.push(`pin.json names contract "${pin.contract}"`);
  if (pin.version !== expectedVersion) problems.push(`pin.json is v${pin.version}, the client is written for v${expectedVersion}`);
  for (const [path, sha256] of Object.entries(pin.files)) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(dir, 'pinned', path));
    } catch {
      problems.push(`${path} is missing`);
      continue;
    }
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) problems.push(`${path} does not match its pinned hash`);
  }
  if (!pin.files['admin-contract.json']) {
    problems.push('admin-contract.json is not pinned');
  } else {
    try {
      const artifact = JSON.parse(readFileSync(join(dir, 'pinned', 'admin-contract.json'), 'utf8')) as { version?: number };
      if (artifact.version !== pin.version) problems.push(`admin-contract.json is v${artifact.version}, pin.json says v${pin.version}`);
      const header = readFileSync(join(dir, 'pinned', 'admin-contract.d.ts'), 'utf8').match(/^export type AdminContractVersion = (\d+);$/m);
      if (Number(header?.[1]) !== pin.version) problems.push(`admin-contract.d.ts is v${header?.[1]}, pin.json says v${pin.version}`);
    } catch {
      // Named above as a hash mismatch or a missing file.
    }
  }
  if (problems.length > 0) {
    throw new Error(`The pinned Table Derby admin contract is not valid (re-pin with scripts/td-pin-contract.mjs): ${problems.join('; ')}`);
  }
  return pin;
}
