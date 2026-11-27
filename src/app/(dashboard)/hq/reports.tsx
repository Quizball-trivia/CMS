'use client';

import { useState } from 'react';
import { Archive, ChevronDown, ExternalLink, Loader2, PenLine, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useArchiveReport, useCreateReport, useHarnessReports, useHqClock, useSetHarnessPolicy } from '@/hooks';
import { formatRelative } from '@/lib/hq-time';
import { cn } from '@/lib/utils';
import type { HarnessReport, HqDepartmentKey } from '@/types';
import { EmptyState, errorMessage, LoadErrorState, Panel, RefreshErrorBanner, Section } from './hq-ui';

// What the desk agents write for a department: the Growth Analyst's weekly
// read, the Investor Update Writer's draft, the Investor Scout's list. A person
// reads it here, asks for a fresh one, or puts it away. Agents never send any
// of it to anyone outside the company.

/** What asking each agent for a report is called on its button. */
const ASK_LABEL: Record<string, string> = {
  'growth-analyst': 'New growth read',
  'investor-update-writer': 'New investor update draft',
  'investor-scout': 'New investor list',
};
const EVERY: Record<string, string> = { week: 'every Monday', month: 'on the 1st of each month' };

const STATUS: Record<HarnessReport['status'], { label: string; tone: string }> = {
  writing: { label: 'Being written', tone: 'bg-sky-50 text-sky-700' },
  ready: { label: 'Ready to read', tone: 'bg-brand-soft text-brand-deep' },
  failed: { label: 'Did not finish', tone: 'bg-red-50 text-red-700' },
  archived: { label: 'Put away', tone: 'bg-slate-100 text-slate-600' },
};

/** A report's address when it is a real web page, else null: an agent's text is never trusted as a link. */
export function safeLink(source: string): string | null {
  try {
    const u = new URL(source);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function Body({ r }: { r: HarnessReport }) {
  const b = r.body;
  if (!b) return null;
  return (
    <div className="space-y-5 border-t border-slate-100 px-4 py-4 sm:px-5">
      {b.leads.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Who to talk to ({b.leads.length})</h4>
          <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {b.leads.map((l, i) => {
              const href = safeLink(l.source);
              return (
                <li key={`${l.name}-${i}`} className="grid gap-x-4 gap-y-1 px-3.5 py-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-950">
                      <span className="mr-1.5 tabular-nums text-slate-400">{i + 1}.</span>
                      {l.name}
                    </div>
                    <div className="text-[12px] text-slate-500">{[l.kind, l.where].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="min-w-0 space-y-1 text-[13px] leading-relaxed text-slate-700">
                    <p>{l.why}</p>
                    {l.reach && (
                      <p>
                        <span className="font-medium text-slate-500">How to reach: </span>
                        {l.reach}
                      </p>
                    )}
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 font-medium text-slate-900 underline-offset-2 hover:underline">
                        <span className="truncate">{new URL(href).hostname.replace(/^www\./, '')}</span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[12px] text-slate-500">Found on the public web by an agent. Open the page and check each one before you write to them.</p>
        </div>
      )}
      {b.sections.map((s) => (
        <div key={s.heading}>
          <h4 className="mb-1.5 font-display text-[15px] font-semibold text-slate-950">{s.heading}</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-700 marker:text-slate-300">
            {s.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
      {b.questions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <h4 className="text-[13px] font-semibold text-amber-900">The agent asks</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-amber-900">
            {b.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReportCard({ r, now, open, onToggle }: { r: HarnessReport; now: number; open: boolean; onToggle: () => void }) {
  const archive = useArchiveReport();
  const st = STATUS[r.status];
  const readable = r.status === 'ready' && !!r.body;
  return (
    <Panel as="article" aria-label={r.title} className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
        <div className="min-w-[12rem] flex-1">
          <p className="text-[12px] text-slate-500">
            Report {r.number} · {r.agentName} · {formatRelative(r.createdAt, now)}
            {r.requestedBy && r.requestedBy !== 'schedule' ? ` · asked by ${r.requestedBy}` : ''}
          </p>
          <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-snug text-slate-950">{r.title}</h3>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium', st.tone)}>
          {r.status === 'writing' && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {st.label}
        </span>
      </div>
      {r.status === 'writing' && <p className="px-4 pb-4 text-[13px] text-slate-600 sm:px-5">{r.agentName} is working on it. This usually takes a few minutes; the page refreshes by itself.</p>}
      {r.status === 'failed' && (
        <p className="px-4 pb-3 text-[13px] text-red-700 sm:px-5">
          It could not be finished{r.error ? `: ${r.error}` : '.'} Ask for a new one, or put this away.
        </p>
      )}
      {readable && <p className="px-4 pb-3 text-[14px] leading-relaxed text-slate-800 sm:px-5">{r.body!.summary}</p>}
      {(readable || r.status === 'failed') && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3.5 sm:px-5">
          {readable && (
            <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-[13px] font-medium text-white transition hover:bg-slate-800">
              {open ? 'Close' : 'Read it'} <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} aria-hidden />
            </button>
          )}
          <button
            type="button"
            disabled={archive.isPending}
            onClick={() => archive.mutate(r.id, { onSuccess: () => toast.success('Put away'), onError: (e) => toast.error(errorMessage(e, 'Could not put it away')) })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:opacity-50"
          >
            <Archive className="size-3.5" aria-hidden /> Put away
          </button>
        </div>
      )}
      {readable && open && <Body r={r} />}
    </Panel>
  );
}

/** A department's reports, newest first, and the buttons to ask its agents for a new one. */
export function Reports({ department }: { department: HqDepartmentKey }) {
  const { data, error, isLoading, refetch } = useHarnessReports();
  const create = useCreateReport();
  const now = useHqClock().getTime();
  const [open, setOpen] = useState<string | null>(null);
  const writers = (data?.agents ?? []).filter((a) => a.department === department);
  const items = (data?.items ?? []).filter((r) => r.department === department);
  // Nothing to show for a department none of whose agents write reports.
  if (data && writers.length === 0 && items.length === 0) return null;
  const writing = new Set(items.filter((r) => r.status === 'writing').map((r) => r.agent));

  return (
    <Section
      title={
        <>
          <Sparkles className="size-4 text-slate-400" aria-hidden /> From the agents
        </>
      }
      description={
        writers.length > 0
          ? `Written from our real numbers. ${writers.filter((w) => w.every).length ? 'They arrive by themselves on schedule; you can also ask for one now.' : 'Ask for one when you need it.'} Nothing here is sent to anyone: a person reads it and decides.`
          : undefined
      }
      actions={
        writers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {writers.map((w) => (
              <button
                key={w.slug}
                type="button"
                disabled={create.isPending || writing.has(w.slug)}
                title={w.every ? `Also arrives by itself ${EVERY[w.every] ?? ''}` : undefined}
                onClick={() => create.mutate(w.slug, { onSuccess: () => toast.success('Started. It will be here in a few minutes.'), onError: (e) => toast.error(errorMessage(e, 'Could not start it')) })}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <PenLine className="size-3.5" aria-hidden /> {ASK_LABEL[w.slug] ?? 'New report'}
              </button>
            ))}
          </div>
        )
      }
    >
      {error && !data ? (
        <LoadErrorState error={error} fallback="Could not load the reports" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the reports…
        </div>
      ) : (
        <div className="space-y-3">
          {error && <RefreshErrorBanner />}
          {items.length === 0 ? (
            <EmptyState>Nothing written yet. The first reports arrive by themselves, or ask for one above.</EmptyState>
          ) : (
            items.map((r) => <ReportCard key={r.id} r={r} now={now} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />)
          )}
        </div>
      )}
    </Section>
  );
}

/** What every desk agent is told about the company. The owners keep it true. */
export function CompanyProfile() {
  const { data, error } = useHarnessReports();
  const save = useSetHarnessPolicy();
  const [draft, setDraft] = useState<string | null>(null);
  if (!data) return error ? <LoadErrorState error={error} fallback="Could not load what the agents know about the company" /> : null;
  const text = draft ?? data.profile;
  const changed = draft !== null && draft.trim() !== data.profile.trim();
  const tooShort = text.trim().length < 20;
  return (
    <Section
      title="What the agents know about QuizBall"
      description="Every agent that writes for Marketing, Partners or Investors is given this text, and is told never to fill a gap in it with a guess. Keep it true: the stage of the company, what we are raising, how we make money. Only an owner can change it."
    >
      <Panel className="space-y-3 p-4 sm:p-5">
        <label htmlFor="company-profile" className="sr-only">
          About the company
        </label>
        <textarea
          id="company-profile"
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          maxLength={4000}
          // Not while it is being saved: what is typed then would be lost when the saved text comes back.
          disabled={save.isPending}
          className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-[14px] leading-relaxed text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!changed || tooShort || save.isPending}
            onClick={() =>
              save.mutate(
                { key: 'company.profile', value: text.trim() },
                {
                  onSuccess: () => {
                    setDraft(null);
                    toast.success('Saved. Agents use it from their next report.');
                  },
                  onError: (e) => toast.error(errorMessage(e, 'Could not save it')),
                }
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 text-[13px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            {save.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Save
          </button>
          {changed && !save.isPending && (
            <button type="button" onClick={() => setDraft(null)} className="text-[13px] font-medium text-slate-600 underline-offset-2 hover:underline">
              Undo changes
            </button>
          )}
          <span className="ml-auto text-[12px] tabular-nums text-slate-500">{tooShort ? 'Too short to save' : `${text.trim().length.toLocaleString()} of 4,000 characters`}</span>
        </div>
      </Panel>
    </Section>
  );
}
