'use client';

import { useMemo, useState } from 'react';
import { EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { TdCellTitle, TdContentList } from '@/components/td/content/td-content-list';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TdMediaThumb, TdUploadButton } from '@/components/td/media/td-media';
import { useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import type { MediaUpload } from '@/lib/td/contract';
import { tdErrorText } from '@/lib/td/errors';
import { t } from '@/lib/td/i18n';
import { useInitialSearch } from './use-initial-search';

/** The rights an image can lack, as the list names them. */
const RIGHTS = { author: t('credit'), license: t('licence'), source: t('source') } as const;

export function TdClubsTab() {
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const initial = useInitialSearch();
  const media = useTdAllRows('media', { status: 'draft,ready,approved' });
  const byKey = useMemo(() => new Map(media.data?.rows.map((row) => [row.data.key, row]) ?? []), [media.data]);
  return (
    <>
      <TdContentList
        type="clubs"
        title={t('Clubs')}
        description={t('Used by Career Path, onboarding and cards. A crest is a file of the web app or an uploaded image.')}
        initialSearch={initial}
        onOpen={(row) => setTarget({ type: 'clubs', row })}
        onCreate={() => setTarget({ type: 'clubs', row: null })}
        createLabel={t('New club')}
        searchPlaceholder={t('Search names and countries')}
        emptyTitle={t('No clubs yet')}
        columns={[
          {
            header: t('Crest'),
            className: 'w-16',
            cell: (row) => {
              const crest = row.data.crestImageKey ? byKey.get(row.data.crestImageKey) : undefined;
              return crest ? <TdMediaThumb uploadId={crest.data.uploadId} url={crest.data.url} alt={row.data.label} className="size-9" /> : <span className="font-mono text-[10px] text-(--td-text-3)">{row.data.crest}</span>;
            },
          },
          {
            header: t('Club'),
            cell: (row) => (
              <span className="flex items-center gap-2">
                <TdCellTitle title={row.data.label} sub={row.data.key} />
                {row.data.hidden && <EyeOff className="size-3.5 shrink-0 text-(--td-text-3)" aria-label={t('Hidden from the picker')} />}
              </span>
            ),
          },
          { header: t('Country'), className: 'hidden md:table-cell', cell: (row) => <span className="text-xs text-(--td-text-2)">{[row.data.flag, row.data.country].filter(Boolean).join(' ')}</span> },
        ]}
      />
      <TdContentEditorDialog target={target} onClose={() => setTarget(null)} />
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
        () => toast.message(t('The upload was not saved as an image, so it was removed.')),
        (error: unknown) => toast.error(t('The unused upload stays: {error}', { error: tdErrorText(error) })),
      );
    }
  };

  return (
    <>
      <TdContentList
        type="media"
        title={t('Images')}
        description={t('Uploads stay private until a release uses them. A publisher approves an image with its licence, credit and source.')}
        initialSearch={initial}
        onOpen={(row) => setTarget({ type: 'media', row })}
        searchPlaceholder={t('Search keys, credits, sources')}
        emptyTitle={t('No images yet')}
        emptyBody={t('Upload one: JPEG, PNG or WebP, at most 2 MB.')}
        actions={
          <TdUploadButton
            onUploaded={(upload) => {
              setPending(upload);
              setTarget({ type: 'media', row: null, preset: { uploadId: upload.id, url: null, width: upload.width, height: upload.height } });
            }}
          />
        }
        columns={[
          { header: t('Image'), className: 'w-20', cell: (row) => <TdMediaThumb uploadId={row.data.uploadId} url={row.data.url} alt={row.data.key} className="h-12 w-16" /> },
          {
            header: t('Key'),
            cell: (row) => <TdCellTitle title={row.data.key} sub={row.data.url ? t('{width} × {height} · by URL', { width: row.data.width, height: row.data.height }) : `${row.data.width} × ${row.data.height}`} />,
          },
          {
            header: t('Rights'),
            className: 'hidden md:table-cell',
            cell: (row) => {
              const missing = (['author', 'license', 'source'] as const).filter((field) => !row.data[field]?.trim());
              return missing.length ? (
                <span className="text-xs text-amber-800">{t('Missing {rights}', { rights: missing.map((field) => RIGHTS[field]).join(', ') })}</span>
              ) : (
                <span className="line-clamp-1 text-xs text-(--td-text-2)">
                  {row.data.author} · {row.data.license}
                </span>
              );
            },
          },
        ]}
      />
      <TdContentEditorDialog
        target={target}
        onClose={close}
        onSaved={(row) => {
          if (pending && (row.data as { uploadId?: string }).uploadId === pending.id) setPending(null);
        }}
      />
    </>
  );
}
