import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { DirectorPreview, type DirectorSnapshot } from './preview';

// Local-only preview of the Director page on a saved copy of real HQ data. HQ data lives only on production, and this
// repo is public: the snapshot is a gitignored file, never committed. Shape: { takenAt, summary, builds, chat } holding
// the responses of GET /admin/hq/director, /admin/hq/builds and /admin/hq/director/chat.
const SNAPSHOT_FILE = join(process.cwd(), '.local', 'hq-director-snapshot.json');

export const dynamic = 'force-dynamic';

export default async function DirectorPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  let snapshot: DirectorSnapshot;
  try {
    snapshot = JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')) as DirectorSnapshot;
  } catch {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-slate-600">
        <h1 className="mb-2 text-lg font-bold text-slate-900">No Director snapshot</h1>
        <p>
          Save the three API responses as <code>.local/hq-director-snapshot.json</code> in this checkout (gitignored) with the keys{' '}
          <code>takenAt</code>, <code>summary</code>, <code>builds</code> and <code>chat</code>, then reload.
        </p>
      </main>
    );
  }
  return <DirectorPreview snapshot={snapshot} />;
}
