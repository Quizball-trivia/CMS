'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ── Layout primitives ──
// One look for every HQ page: a ruled header, small uppercase section labels,
// flat bordered panels. Pages compose these instead of styling their own.

/** Page width and rhythm shared by every HQ page. */
export const HQ_PAGE = 'mx-auto w-full max-w-7xl space-y-8 pb-16';

/** Labels (section titles, table heads, eyebrows): small, uppercase, tracked. */
export const HQ_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600';

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  /** Ignored: the ruled header has no icon tile. Kept so callers needn't change. */
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-slate-200 pb-5">
      {/* A floor on the width so the actions wrap below the title on a phone instead of squeezing it. */}
      <div className="min-w-[12rem] flex-1">
        {eyebrow && <div className={cn(HQ_LABEL, 'mb-1')}>{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled block of a page. `description` is one line of context under the label. */
export function Section({
  title,
  count,
  countTone,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  count?: number;
  countTone?: 'neutral' | 'attention';
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-950">
            {title}
            {count !== undefined && <CountPill n={count} tone={countTone} />}
          </h2>
          {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3 text-sm">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Flat bordered surface. */
export function Panel({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'article' | 'section' }) {
  return <As className={cn('rounded-lg border border-slate-200 bg-white', className)}>{children}</As>;
}

export function CountPill({ n, tone = 'neutral' }: { n: number; tone?: 'neutral' | 'attention' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[11px] font-semibold tabular-nums tracking-normal',
        tone === 'attention' && n > 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
      )}
    >
      {n}
    </span>
  );
}

/** How a count moved against the period before: "▲ 12%", "▼ 13%", "new", or nothing when there is nothing to compare. */
export function Delta({ now, before, className }: { now: number; before: number; className?: string }) {
  if (now === 0 && before === 0) return null;
  const pct = before === 0 ? null : Math.round(((now - before) / before) * 100);
  const tone = pct === null || pct > 0 ? 'bg-emerald-50 text-emerald-700' : pct < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600';
  const text = pct === null ? 'new' : pct === 0 ? 'no change' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-semibold tabular-nums', tone, className)} title={`${before.toLocaleString()} the week before`}>
      {text}
    </span>
  );
}

/** A small trend line for a run of numbers (oldest first). Decorative: the numbers themselves are beside it. */
export function Spark({ values, className, tone = 'slate' }: { values: number[]; className?: string; tone?: 'slate' | 'emerald' | 'sky' | 'violet' }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const stroke = { slate: '#64748b', emerald: '#059669', sky: '#0284c7', violet: '#7c3aed' }[tone];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-8 w-full', className)} aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={stroke} opacity={0.08} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A share of a whole as a thin bar (0-100). */
export function Meter({ pct, tone = 'good', className }: { pct: number; tone?: 'good' | 'attention' | 'bad'; className?: string }) {
  const fill = tone === 'bad' ? 'bg-red-500' : tone === 'attention' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-slate-100', className)} aria-hidden>
      <div className={cn('h-full rounded-full', fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** One number with its label, for stat strips. `spark` draws its recent trend underneath. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  spark,
  sparkTone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'attention' | 'good';
  spark?: number[];
  sparkTone?: 'slate' | 'emerald' | 'sky' | 'violet';
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className={HQ_LABEL}>{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'attention' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-950'
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[13px] text-slate-600">{hint}</div>}
      {spark && <Spark values={spark} tone={sparkTone} className="mt-2" />}
    </div>
  );
}

// ── Misc ──

/** Full error state for a query that failed with nothing cached to show. */
export function LoadErrorState({ error, fallback, onRetry }: { error: unknown; fallback: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="min-w-0 flex-1">{errorMessage(error, fallback)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
          Retry
        </button>
      )}
    </div>
  );
}

/** Non-destructive notice for a failed background refetch while cached data stays on screen. */
export function RefreshErrorBanner({ className }: { className?: string }) {
  return (
    <div role="status" className={cn('rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800', className)}>
      Couldn&apos;t refresh — retrying. You&apos;re seeing the last loaded version.
    </div>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500', className)}>{children}</p>;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message || fallback;
  }
  return fallback;
}
