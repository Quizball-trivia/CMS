import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { HqPreview, type HqSnapshot } from './preview';

// Local-only preview of the HQ pages on a saved copy of real data, with no login and no backend:
//   /dev/hq?page=home|content|games|analytics|content-gaps   (content takes &tab=…)
// HQ data lives only on production and this repo is public, so the snapshot is a gitignored file, never committed:
// .local/hq-snapshot.json = { takenAt, overview, games, analytics } holding the responses of
// GET /admin/harness/overview, /admin/harness/games and /admin/hq/analytics?days=30.
const SNAPSHOT_FILE = join(process.cwd(), '.local', 'hq-snapshot.json');

export const dynamic = 'force-dynamic';

export default async function HqPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  let snapshot: HqSnapshot;
  try {
    snapshot = JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')) as HqSnapshot;
  } catch {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-slate-600">
        <h1 className="mb-2 text-lg font-bold text-slate-900">No HQ snapshot</h1>
        <p>
          Save the API responses as <code>.local/hq-snapshot.json</code> in this checkout (gitignored) with the keys <code>takenAt</code>, <code>overview</code>,{' '}
          <code>games</code> and <code>analytics</code>, then reload.
        </p>
      </main>
    );
  }
  return <HqPreview snapshot={snapshot} />;
}
