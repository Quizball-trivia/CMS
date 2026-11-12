'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { HqBuildScreenshots } from '@/types';
import { HQ_LABEL } from './hq-ui';

/**
 * A build's play-test screenshots: the page before the change and after it, phone or desktop. The links are signed
 * and expire; a failed image says so instead of showing a broken icon.
 */
export function BuildShots({ shots, compact = false }: { shots: HqBuildScreenshots | null | undefined; compact?: boolean }) {
  const sizes = (['phone', 'desktop'] as const).filter((s) => shots?.after.some((x) => x.size === s) || shots?.before.some((x) => x.size === s));
  const [size, setSize] = useState<'phone' | 'desktop'>(sizes[0] ?? 'phone');
  if (!shots || sizes.length === 0) return null;
  const shown = sizes.includes(size) ? size : sizes[0];
  const before = shots.before.find((s) => s.size === shown);
  const after = shots.after.find((s) => s.size === shown);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={HQ_LABEL}>Screenshots</span>
        {sizes.length > 1 && (
          <div role="tablist" aria-label="Screen size" className="inline-flex rounded-md border border-slate-200 p-0.5">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === shown}
                onClick={() => setSize(s)}
                className={cn('rounded px-2 py-0.5 text-[12px] font-medium', s === shown ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-950')}
              >
                {s === 'phone' ? 'Phone' : 'Desktop'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={cn('grid gap-3', compact ? 'grid-cols-2 sm:max-w-md' : 'grid-cols-2', shown === 'phone' && !compact && 'sm:max-w-lg')}>
        {/* Keyed by link: a new (refreshed or other-size) link gets a fresh try after an earlier one failed. */}
        <Shot key={`b:${before?.url ?? ''}`} label="Before" url={before?.url} missing="No before shot (the base version did not start in the sandbox)." />
        <Shot key={`a:${after?.url ?? ''}`} label="After" url={after?.url} missing="No after shot." />
      </div>
    </div>
  );
}

function Shot({ label, url, missing }: { label: string; url: string | undefined; missing: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="m-0 min-w-0 space-y-1">
      <figcaption className="text-[12px] font-medium text-slate-600">{label}</figcaption>
      {url && !failed ? (
        <a href={url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${label} the change`} loading="lazy" className="block h-auto w-full" onError={() => setFailed(true)} />
        </a>
      ) : (
        <div className="grid min-h-24 place-items-center rounded-md border border-dashed border-slate-200 px-2 text-center text-[12px] text-slate-500">
          {failed ? 'The link expired; reload the page.' : missing}
        </div>
      )}
    </figure>
  );
}
