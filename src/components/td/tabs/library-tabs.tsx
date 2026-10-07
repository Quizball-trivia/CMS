'use client';

import { useMemo, useState } from 'react';
import { EyeOff, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { TdCellTitle, TdContentList } from '@/components/td/content/td-content-list';
import { TdContentEditorSheet, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TdMediaThumb, TdUploadButton } from '@/components/td/media/td-media';
import { useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import type { MediaUpload } from '@/lib/td/contract';
import { tdErrorText } from '@/lib/td/errors';
import { cn } from '@/lib/utils';
import { useInitialSearch } from './use-initial-search';

const DIFFICULTY_STYLES = {
  easy: 'text-(--td-new)',
  medium: 'text-amber-300',
  hard: 'text-(--td-danger)',
} as const;

export function TdPracticeTab() {
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const initial = useInitialSearch();
  return (
    <>
      <TdContentList
        type="practice-questions"
        title="Question bank"
        description="A run opens with 5 easy questions, then 10 medium, then hard ones."
        initialSearch={initial}
        onOpen={(row) => setTarget({ type: 'practice-questions', row })}
        onCreate={() => setTarget({ type: 'practice-questions', row: null })}
        createLabel="New question"
        searchPlaceholder="Search questions, options, categories"
        emptyTitle="No practice questions yet"
        columns={[
          { header: 'Question', cell: (row) => <TdCellTitle title={row.data.prompt} sub={row.data.key} /> },
          { header: 'Difficulty', className: 'w-24', cell: (row) => <span className={cn('text-xs font-semibold capitalize', DIFFICULTY_STYLES[row.data.difficulty])}>{row.data.difficulty}</span> },
          {
            header: 'Category',
            className: 'hidden md:table-cell',
            cell: (row) => (
              <span className="flex items-center gap-2 text-xs text-(--td-text-2)">
                {row.data.category}
                {row.data.imageKey && <ImageIcon className="size-3.5 text-(--td-text-3)" aria-label="Has an image" />}
              </span>
            ),
          },
        ]}
      />
      <TdContentEditorSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

export function TdClubsTab() {
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const initial = useInitialSearch();
  const media = useTdAllRows('media', { status: 'draft,ready,approved' });
  const byKey = useMemo(() => new Map(media.data?.rows.map((row) => [row.data.key, row]) ?? []), [media.data]);
  return (
    <>
      <TdContentList
        type="clubs"
        title="Clubs"
        description="Used by Career Path, onboarding and cards. A crest is a file of the web app or an uploaded image."
        initialSearch={initial}
        onOpen={(row) => setTarget({ type: 'clubs', row })}
        onCreate={() => setTarget({ type: 'clubs', row: null })}
        createLabel="New club"
        searchPlaceholder="Search names and countries"
        emptyTitle="No clubs yet"
        columns={[
          {
            header: 'Crest',
            className: 'w-16',
            cell: (row) => {
              const crest = row.data.crestImageKey ? byKey.get(row.data.crestImageKey) : undefined;
              return crest ? <TdMediaThumb uploadId={crest.data.uploadId} url={crest.data.url} alt={row.data.label} className="size-9" /> : <span className="font-mono text-[10px] text-(--td-text-3)">{row.data.crest}</span>;
            },
          },
          {
            header: 'Club',
            cell: (row) => (
              <span className="flex items-center gap-2">
                <TdCellTitle title={row.data.label} sub={row.data.key} />
                {row.data.hidden && <EyeOff className="size-3.5 shrink-0 text-(--td-text-3)" aria-label="Hidden from the picker" />}
              </span>
            ),
          },
          { header: 'Country', className: 'hidden md:table-cell', cell: (row) => <span className="text-xs text-(--td-text-2)">{[row.data.flag, row.data.country].filter(Boolean).join(' ')}</span> },
        ]}
      />
      <TdContentEditorSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

export function TdMediaTab() {
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  // An upload no row uses yet: removed if its row is never created.
  const [pending, setPending] = useState<MediaUpload | null>(null);
  const write = useTdWrite();
  const initial = useInitialSearch();

  const close = () => {
    setTarget(null);
    if (pending) {
      const upload = pending;
      setPending(null);
      void write((operation) => tdAdmin.media.remove(upload.id, operation), []).then(
        () => toast.message('The upload was not saved as an image, so it was removed.'),
        (error: unknown) => toast.error(`The unused upload stays: ${tdErrorText(error)}`),
      );
    }
  };

  return (
    <>
      <TdContentList
        type="media"
        title="Images"
        description="Uploads stay private until a release uses them. A publisher approves an image with its licence, credit and source."
        initialSearch={initial}
        onOpen={(row) => setTarget({ type: 'media', row })}
        searchPlaceholder="Search keys, credits, sources"
        emptyTitle="No images yet"
        emptyBody="Upload one: JPEG, PNG or WebP, at most 2 MB."
        actions={
          <TdUploadButton
            onUploaded={(upload) => {
              setPending(upload);
              setTarget({ type: 'media', row: null, preset: { uploadId: upload.id, url: null, width: upload.width, height: upload.height } });
            }}
          />
        }
        columns={[
          { header: 'Image', className: 'w-20', cell: (row) => <TdMediaThumb uploadId={row.data.uploadId} url={row.data.url} alt={row.data.key} className="h-12 w-16" /> },
          { header: 'Key', cell: (row) => <TdCellTitle title={row.data.key} sub={`${row.data.width} × ${row.data.height}${row.data.url ? ' · by URL' : ''}`} /> },
          {
            header: 'Rights',
            className: 'hidden md:table-cell',
            cell: (row) => {
              const missing = (['author', 'license', 'source'] as const).filter((field) => !row.data[field]?.trim());
              return missing.length ? (
                <span className="text-xs text-amber-300">Missing {missing.map((f) => (f === 'author' ? 'credit' : f === 'license' ? 'licence' : f)).join(', ')}</span>
              ) : (
                <span className="line-clamp-1 text-xs text-(--td-text-2)">
                  {row.data.author} · {row.data.license}
                </span>
              );
            },
          },
        ]}
      />
      <TdContentEditorSheet
        target={target}
        onClose={close}
        onSaved={(row) => {
          if (pending && (row.data as { uploadId?: string }).uploadId === pending.id) setPending(null);
        }}
      />
    </>
  );
}
