'use client';

import { useMemo, useRef, useState } from 'react';
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
import type { MediaUpload } from '@/lib/td/contract';
import { cn } from '@/lib/utils';

export const TD_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const TD_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

type MediaRow = TdContentRow<'media'>;

/** Whether an image counts for approving what shows it: approved with its rights and not archived (a pending edit does not matter). */
export function mediaUsable(row: MediaRow): boolean {
  const approved = row.approved;
  return Boolean(row.status !== 'archived' && row.approvedVersion !== null && approved?.author?.trim() && approved.license?.trim() && approved.source?.trim());
}

/** What a browser can check before sending; the API checks the bytes again. */
export function uploadProblem(file: File): string | null {
  if (!TD_UPLOAD_TYPES.includes(file.type as (typeof TD_UPLOAD_TYPES)[number])) return 'Only JPEG, PNG or WebP images are accepted.';
  if (file.size > TD_UPLOAD_MAX_BYTES) return `An image is at most 2 MB (this one is ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
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
        <a href={url} target="_blank" rel="noreferrer noopener" title="Kept by URL: opens in a new tab" className="grid size-full place-items-center hover:text-foreground">
          <ExternalLink className="size-4" />
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
export function TdUploadButton({ onUploaded, label = 'Upload image', variant = 'default' }: { onUploaded: (upload: MediaUpload) => void; label?: string; variant?: 'default' | 'secondary' }) {
  const input = useRef<HTMLInputElement>(null);
  const write = useTdWrite();
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
    setError(null);
    try {
      onUploaded(await write((operation) => tdAdmin.media.upload(file, file.type, operation), []));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept={TD_UPLOAD_TYPES.join(',')} className="hidden" data-testid="td-upload-input" onChange={(event) => void choose(event.target.files?.[0])} />
      <Button type="button" variant={variant} className="w-fit rounded-lg" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {label}
      </Button>
      <p className="text-xs text-(--td-text-3)">JPEG, PNG or WebP, at most 2 MB and 4096 pixels a side.</p>
      <TdErrorPanel error={error} />
    </div>
  );
}

/** Chooses an image (a media row, by key) for a card, a practice question or a club. */
export function TdMediaPicker({ label, value, onChange, hint }: { label: string; value: string | null; onChange: (key: string | null) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const media = useTdAllRows('media', { status: 'draft,ready,approved' });
  const chosen = media.data?.rows.find((row) => row.data.key === value);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-(--td-text-3)">{label}</span>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-(--td-input)/40 p-2">
        <TdMediaThumb uploadId={chosen?.data.uploadId} url={chosen?.data.url} alt={value ?? 'No image'} />
        <div className="min-w-0 flex-1">
          {value ? (
            <>
              <p className="truncate font-mono text-xs">{value}</p>
              {chosen ? (
                mediaUsable(chosen) ? (
                  <p className="text-xs text-(--td-new)">Approved with its rights</p>
                ) : (
                  <p className="text-xs text-amber-300">Not approved with its rights yet: approving this needs it</p>
                )
              ) : (
                media.isSuccess && <p className="text-xs text-(--td-danger)">No image has this key</p>
              )}
            </>
          ) : (
            <p className="text-sm text-(--td-text-3)">No image</p>
          )}
        </div>
        <Button type="button" variant="secondary" size="sm" className="rounded-lg" onClick={() => setOpen(true)}>
          Choose
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove image" onClick={() => onChange(null)}>
            <X />
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-(--td-text-3)">{hint}</p>}
      <TdMediaPickerDialog open={open} onOpenChange={setOpen} rows={media.data?.rows ?? []} loading={media.isLoading} onPick={(key) => { onChange(key); setOpen(false); }} />
    </div>
  );
}

function TdMediaPickerDialog({ open, onOpenChange, rows, loading, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; rows: MediaRow[]; loading: boolean; onPick: (key: string) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => !needle || [row.data.key, row.data.author, row.data.source].some((text) => text?.toLowerCase().includes(needle)));
  }, [rows, q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden bg-(--td-surface-2) sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>Images are approved with their licence, credit and source before anything showing them can be approved.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--td-text-3)" />
          <Input autoFocus value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by key, credit or source" className="h-10 rounded-full bg-(--td-input) pl-9" />
        </div>
        <ul className="-mx-2 grid max-h-[50vh] gap-1 overflow-y-auto px-2 sm:grid-cols-2">
          {loading && <li className="text-sm text-(--td-text-3)">Loading…</li>}
          {!loading && shown.length === 0 && <li className="text-sm text-(--td-text-3)">No images. Upload one on the Media tab.</li>}
          {shown.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => onPick(row.data.key)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-card">
                <TdMediaThumb uploadId={row.data.uploadId} url={row.data.url} alt={row.data.key} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">{row.data.key}</span>
                  <span className="block truncate text-xs text-(--td-text-3)">{row.data.author ?? 'No credit'} · {row.data.license ?? 'No licence'}</span>
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

