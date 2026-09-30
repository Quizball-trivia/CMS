// Pins the Table Derby admin contract artifact into this repo.
// Usage: node scripts/td-pin-contract.mjs <table-derby checkout>
// Copies packages/contracts/dist-admin byte for byte into src/lib/td/contract/ and writes
// pin.json (version, source commit, SHA-256 per file). The build and the tests refuse a copy
// that no longer matches pin.json, so the pinned files are only ever changed through here.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.argv[2];
if (!repo) {
  console.error('usage: node scripts/td-pin-contract.mjs <table-derby checkout>');
  process.exit(1);
}
const source = join(repo, 'packages/contracts/dist-admin');
const target = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/td/contract/pinned');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

const contract = JSON.parse(readFileSync(join(source, 'admin-contract.json'), 'utf8'));
if (contract.contract !== 'table-derby-admin' || !Number.isInteger(contract.version)) {
  console.error('not a Table Derby admin contract artifact');
  process.exit(1);
}
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
if (git('status', '--porcelain', '--', 'packages/contracts/dist-admin')) {
  console.error('dist-admin has uncommitted changes; pin a committed artifact');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
const pinned = {};
for (const path of files(source)) {
  const bytes = readFileSync(join(source, path));
  mkdirSync(dirname(join(target, path)), { recursive: true });
  writeFileSync(join(target, path), bytes);
  pinned[path] = createHash('sha256').update(bytes).digest('hex');
}
const pin = {
  contract: contract.contract,
  version: contract.version,
  source: { repo: 'Quizball-trivia/table-derby', commit: git('log', '-1', '--format=%H', '--', 'packages/contracts/dist-admin') },
  files: pinned,
};
writeFileSync(join(target, '../pin.json'), `${JSON.stringify(pin, null, 2)}\n`);
console.log(`pinned admin contract v${pin.version} (${Object.keys(pinned).length} files) from ${pin.source.commit}`);
