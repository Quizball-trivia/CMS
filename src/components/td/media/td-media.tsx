'use client';

import { useContext, useMemo, useRef, useState } from 'react';
import { ExternalLink, ImageIcon, ImageOff, Loader2, Search, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TdStatusChip } from '@/components/td/content/td-status';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { useTdAllRows, useTdUploadUrl, useTdWrite } from '@/hooks/use-td-content';
import type { TdContentRow } from '@/lib/td/admin-api';
import { tdAdmin } from '@/lib/td/client';
import { contentWriteIssues } from '@/lib/td/content-rules';
import type { MediaUpload, SchemaIssue } from '@/lib/td/contract';
import { t } from '@/lib/td/i18n';
import { TdIssueText } from '@/components/td/content/td-form';
import { TdOpenImageContext } from '@/components/td/content/td-open-row';
import { useTdUploadingReport } from '@/components/td/content/td-uploading';
import { legacyImageSrc } from '@/lib/td/legacy-images';
import { cn } from '@/lib/utils';

export const TD_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const TD_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

type MediaRow = TdContentRow<'media'>;

/** Whether an image counts for approving what shows it: approved and not archived (a pending edit does not matter). */
export function mediaUsable(row: MediaRow): boolean {
  return row.status !== 'archived' && row.approvedVersion !== null;
}

/** The image a release carries (the approved version), or the working one when nothing is approved yet. */
export function releasedImage(row: MediaRow): TdContentRow<'media'>['data'] {
  return row.approved && row.status !== 'archived' ? row.approved : row.data;
}

/** A newer image waits for approval (releases keep the approved one until then). */
export const replacementPending = (row: MediaRow) => Boolean(row.approved && (row.data.uploadId !== row.approved.uploadId || row.data.url !== row.approved.url));

/** What a browser can check before sending; the API checks the bytes again. */
export function uploadProblem(file: File): string | null {
  if (!TD_UPLOAD_TYPES.includes(file.type as (typeof TD_UPLOAD_TYPES)[number])) return t('Only JPEG, PNG or WebP images are accepted.');
  if (file.size > TD_UPLOAD_MAX_BYTES) return t('An image is at most 2 MB (this one is {size} MB).', { size: (file.size / 1024 / 1024).toFixed(1) });
  return null;
}

/** An image by its upload (fetched with the staff token); a legacy URL image is a link, as the CMS may not load foreign images. */
export function TdMediaThumb({ uploadId, url, alt, className }: { uploadId?: string | null; url?: string | null; alt: string; className?: string }) {
  const file = useTdUploadUrl(uploadId);
  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-(--td-input) text-(--td-text-3)', className ?? 'size-12')}>
      {uploadId && file.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- an object URL of an authenticated download
        <img src={file.url} alt={alt} className="size-full object-cover" />
      ) : uploadId && file.isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer noopener" title={t('Kept by URL: opens in a new tab')} className="grid size-full place-items-center hover:text-foreground">
          {legacyImageSrc(url) ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from this origin by /td/legacy-image
            <img src={legacyImageSrc(url)!} alt={alt} loading="lazy" className="size-full object-cover" />
          ) : (
            <ExternalLink className="size-4" />
          )}
        </a>
      ) : uploadId ? (
        <ImageOff className="size-4" />
      ) : (
        <ImageIcon className="size-4" />
      )}
    </span>
  );
}

/** Picks a file, checks it, uploads it (raw body). */
export function TdUploadButton({ onUploaded, label = t('Upload image'), variant = 'default' }: { onUploaded: (upload: MediaUpload) => void; label?: string; variant?: 'default' | 'secondary' }) {
  const input = useRef<HTMLInputElement>(null);
  const write = useTdWrite();
  const reportUploading = useTdUploadingReport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    const problem = uploadProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    reportUploading?.(true);
    setError(null);
    try {
      onUploaded(await write((operation) => tdAdmin.media.upload(file, file.type, operation), []));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
      reportUploading?.(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept={TD_UPLOAD_TYPES.join(',')} className="hidden" data-testid="td-upload-input" onChange={(event) => void choose(event.target.files?.[0])} />
      <Button type="button" variant={variant} className="w-fit rounded-lg" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {label}
      </Button>
      <p className="text-xs text-(--td-text-3)">{t('JPEG, PNG or WebP, at most 2 MB and 4096 pixels a side.')}</p>
      <TdErrorPanel error={error} />
    </div>
  );
}

/** Chooses an image (a media row, by key) for a card, a practice question or a club; a new one can be uploaded on the spot. */
export function TdMediaPicker({
  label,
  value,
  onChange,
  hint,
  suggestedKey,
}: {
  label: string;
  value: string | null;
  onChange: (key: string | null) => void;
  hint?: string;
  /** The key offered for an image uploaded from here. */
  suggestedKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const media = useTdAllRows('media', { status: 'draft,ready,approved' });
  const chosen = media.data?.rows.find((row) => row.data.key === value);
  const openImage = useContext(TdOpenImageContext);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
        <TdMediaThumb uploadId={chosen ? releasedImage(chosen).uploadId : null} url={chosen ? releasedImage(chosen).url : null} alt={value ?? t('No image')} className="h-14 w-20" />
        <div className="min-w-0 flex-1">
          {value ? (
            chosen ? (
              mediaUsable(chosen) ? (
                <p className="text-xs font-medium text-emerald-600">
                  {t('Approved')}
                  {replacementPending(chosen) && <span className="text-amber-700"> · {t('a replacement waits for approval; releases show the one here')}</span>}
                </p>
              ) : (
                <p className="text-xs font-medium text-amber-700">{t('It is approved with the question.')}</p>
              )
            ) : (
              media.isSuccess && <p className="text-xs font-medium text-red-600">{t('This image no longer exists')}</p>
            )
          ) : (
            <p className="text-sm text-slate-400">{t('No image')}</p>
          )}
        </div>
        {chosen && openImage && (
          <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs font-bold" onClick={() => openImage(chosen.data.key)}>
            {t('Image details')}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs font-bold" onClick={() => setOpen(true)}>
          {value ? t('Change') : t('Choose')}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Remove image')} onClick={() => onChange(null)}>
            <X />
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-(--td-text-3)">{hint}</p>}
      <TdMediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        rows={media.data?.rows ?? []}
        loading={media.isLoading}
        suggestedKey={suggestedKey}
        onPick={(key) => {
          onChange(key);
          setOpen(false);
        }}
      />
    </div>
  );
}

function TdMediaPickerDialog({
  open,
  onOpenChange,
  rows,
  loading,
  onPick,
  suggestedKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: MediaRow[];
  loading: boolean;
  onPick: (key: string) => void;
  suggestedKey?: string;
}) {
  const [q, setQ] = useState('');
  const [uploaded, setUploaded] = useState<MediaUpload | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => !needle || row.data.key.toLowerCase().includes(needle));
  }, [rows, q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden bg-(--td-surface-2) sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Choose an image')}</DialogTitle>
          <DialogDescription>{t('An image is approved with the question that shows it.')}</DialogDescription>
        </DialogHeader>
        {uploaded ? (
          <NewImageForm
            upload={uploaded}
            suggestedKey={suggestedKey}
            onCancel={() => setUploaded(null)}
            onSaved={(key) => {
              setUploaded(null);
              onPick(key);
            }}
          />
        ) : (
          <TdUploadButton variant="secondary" label={t('Upload a new image')} onUploaded={setUploaded} />
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--td-text-3)" />
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('Search by key')} className="h-10 rounded-full bg-(--td-input) pl-9" />
        </div>
        <ul className="-mx-2 grid max-h-[50vh] gap-1 overflow-y-auto px-2 sm:grid-cols-2">
          {loading && <li className="text-sm text-(--td-text-3)">{t('Loading…')}</li>}
          {!loading && shown.length === 0 && <li className="text-sm text-(--td-text-3)">{t('No images yet: upload one above.')}</li>}
          {shown.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => onPick(row.data.key)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-card">
                <TdMediaThumb uploadId={releasedImage(row).uploadId} url={releasedImage(row).url} alt={row.data.key} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">{row.data.key}</span>
                  {replacementPending(row) && <span className="block text-xs text-amber-800">{t('Replacement waits for approval')}</span>}
                </span>
                <TdStatusChip status={row.status} />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Saves an upload as an image (a media draft) so it can be picked; a publisher approves it later. */
function NewImageForm({ upload, suggestedKey, onCancel, onSaved }: { upload: MediaUpload; suggestedKey?: string; onCancel: () => void; onSaved: (key: string) => void }) {
  const write = useTdWrite();
  const reportBusy = useTdUploadingReport();
  const [key] = useState(suggestedKey ?? `img-${upload.id.slice(0, 8)}`);
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const data = { key: key.trim(), url: null, uploadId: upload.id, width: upload.width, height: upload.height, author: null, license: null, source: null };
    const found = contentWriteIssues('media', 'Media', 'create', { data });
    setIssues(found);
    if (found.length) return;
    setBusy(true);
    // The editor holding the picker waits for this too, so its draft never changes under a save.
    reportBusy?.(true);
    setError(null);
    try {
      await write((operation) => tdAdmin.content('media').create({ data }, operation));
      onSaved(data.key);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
      reportBusy?.(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        <TdMediaThumb uploadId={upload.id} alt={t('New upload')} className="h-14 w-20" />
        <p className="text-xs text-(--td-text-3)">
          {t('Uploaded · {width} × {height} px. Save it as an image to use it.', { width: upload.width, height: upload.height })}
        </p>
      </div>
      <TdIssueText issues={issues} />
      <TdErrorPanel error={error} />
      <div className="flex gap-2">
        <Button size="sm" className="rounded-lg" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="animate-spin" />}
          {t('Save and use it')}
        </Button>
        <Button size="sm" variant="ghost" className="rounded-lg" onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </div>
    </div>
  );
}
