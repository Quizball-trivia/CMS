'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Heart, Inbox, Loader2, Mail, Paperclip, RefreshCw, Search, Sparkles, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useHarnessFeedback, useHqClock, useImportFeedbackEmails, useReadFeedback } from '@/hooks';
import { formatRelative, formatTbilisi } from '@/lib/hq-time';
import { cn } from '@/lib/utils';
import type { HarnessFeedback, HarnessFeedbackItem } from '@/types';
import { EmptyState, errorMessage, Hero, HeroStat, HQ_LABEL, HQ_PAGE, LoadErrorState, ON_HERO, Panel, RefreshErrorBanner, Section } from '../hq-ui';
import { countByKind, filterFeedback, KIND_LOOK, KINDS, languageName, safeAttachment, safeEmail, SOURCE_LABEL, type KindFilter, type LanguageFilter } from './feedback';

// Everything players write to us, in one place: the contact form, the Season 3
// idea survey and the comment left after a game. On top, the Feedback Reader's
// recap. Georgian is shown as written; anything that is neither Georgian nor
// English has its English next to the original.

const GLOW = '#f97316';
const PAGE_SIZE = 40;

function Recap({ data, onOpen }: { data: HarnessFeedback; onOpen: (n: number) => void }) {
  const now = useHqClock().getTime();
  const read = data.recap;
  const recap = read?.recap;
  const onPage = useMemo(() => new Set(data.items.map((i) => i.number)), [data.items]);
  if (!read || !recap) {
    return (
      <EmptyState>
        {data.reading
          ? 'The Feedback Reader is reading everything for the first time. The recap will be here in a few minutes.'
          : data.readError
            ? `The recap could not be written: ${data.readError}`
            : data.total === 0
              ? 'No feedback yet, so there is nothing to recap.'
              : 'No recap yet. Press "New recap" above, or wait: it is written by itself when feedback comes in.'}
      </EmptyState>
    );
  }
  return (
    <Panel className="overflow-hidden">
      <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
        <p className="max-w-3xl text-[15px] leading-relaxed text-slate-900">{recap.summary}</p>

        {recap.urgent.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-red-800">
              <AlertTriangle className="size-3.5" aria-hidden /> Look at this first
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-red-900">
              {recap.urgent.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        {recap.themes.length > 0 && (
          <div>
            <h3 className={HQ_LABEL}>What players are saying</h3>
            <ol className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {recap.themes.map((t, i) => (
                <li key={`${t.title}-${i}`} className="grid gap-x-5 gap-y-1.5 px-4 py-3.5 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="font-display text-[15px] font-semibold leading-snug text-slate-950">{t.title}</div>
                    {t.count > 0 && (
                      <div className="mt-0.5 text-[12px] text-slate-500">
                        {t.count} {t.count === 1 ? 'player says this' : 'players say this'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    {t.points.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-slate-700 marker:text-slate-300">
                        {t.points.map((p, j) => (
                          <li key={j}>{p}</li>
                        ))}
                      </ul>
                    )}
                    {t.refs.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                        Read them:
                        {t.refs.map((n) =>
                          onPage.has(n) ? (
                            <button key={n} type="button" onClick={() => onOpen(n)} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium tabular-nums text-slate-700 transition hover:bg-slate-200 hover:text-slate-950">
                              #{n}
                            </button>
                          ) : (
                            <span key={n} className="px-0.5 tabular-nums">
                              #{n}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {recap.praise.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-900">
              <Heart className="size-3.5" aria-hidden /> What players like
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-emerald-900">
              {recap.praise.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[12px] text-slate-500 sm:px-6">
        Written by the Feedback Reader (an AI agent) {formatRelative(read.createdAt, now)}, from the latest {read.items.toLocaleString()} {read.items === 1 ? 'message' : 'messages'}.
        {data.newSinceRecap > 0 ? ` ${data.newSinceRecap} more arrived since and ${data.newSinceRecap === 1 ? 'is' : 'are'} not in it yet.` : ' Nothing has arrived since.'} It can be wrong: the messages below are the source.
        {data.readError ? ` The last try at a newer recap did not finish: ${data.readError}` : ''}
      </p>
    </Panel>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${n} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('size-3.5', i <= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
      ))}
    </span>
  );
}

function FeedbackCard({ f, now, highlighted }: { f: HarnessFeedbackItem; now: number; highlighted: boolean }) {
  const kind = KIND_LOOK[f.category];
  const email = safeEmail(f.email);
  const attachments = f.attachments.map(safeAttachment).filter((u): u is string => u !== null);
  const who = [f.nickname, f.hasAccount ? 'has an account' : null].filter(Boolean).join(' · ');
  return (
    <Panel as="article" aria-label={`Feedback ${f.number}`} className={cn('scroll-mt-24 px-4 py-3.5 transition sm:px-5', highlighted && 'ring-2 ring-orange-400')}>
      <div id={`feedback-${f.number}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-slate-500">
        <span className="font-medium tabular-nums text-slate-700">#{f.number}</span>
        <span className={cn('rounded-full px-2 py-0.5 font-medium', kind.tone)}>{kind.label}</span>
        <span>{SOURCE_LABEL[f.source]}</span>
        {f.game && <span>· {f.game}</span>}
        {f.rating !== null && <Stars n={f.rating} />}
        <time dateTime={f.receivedAt} title={formatTbilisi(f.receivedAt)} className="ml-auto">
          {formatRelative(f.receivedAt, now)}
        </time>
      </div>

      {f.english ? (
        <div className="mt-2.5 grid gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <div className={HQ_LABEL}>In English</div>
            <p className="mt-1 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-slate-900">{f.english}</p>
          </div>
          <div className="min-w-0 border-t border-slate-100 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
            <div className={HQ_LABEL}>Original · {languageName(f.language)}</div>
            <p dir="auto" lang={f.language ?? undefined} className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-600">
              {f.message}
            </p>
          </div>
        </div>
      ) : (
        <>
          <p dir="auto" lang={f.language && f.language !== 'unknown' ? f.language : undefined} className="mt-2 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-slate-900">
            {f.message}
          </p>
          {f.language === null && <p className="mt-1.5 text-[12px] text-slate-500">Not read by the Feedback Reader yet. If it is not Georgian or English, its English will appear here.</p>}
          {f.language !== null && f.language !== 'ka' && f.language !== 'en' && f.language !== 'unknown' && (
            <p className="mt-1.5 text-[12px] text-amber-700">Written in {languageName(f.language)}. The Feedback Reader gave no English for it.</p>
          )}
        </>
      )}

      {(who || email || f.context || attachments.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[12.5px] text-slate-600">
          {who && <span>{who}</span>}
          {email && (
            <a href={`mailto:${encodeURIComponent(email).replace('%40', '@')}`} className="inline-flex items-center gap-1 font-medium text-slate-900 underline-offset-2 hover:underline">
              <Mail className="size-3.5" aria-hidden /> {email}
            </a>
          )}
          {f.context && <span className="min-w-0 truncate text-slate-500" title={f.context}>Sent from: {f.context}</span>}
          {attachments.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-slate-900 underline-offset-2 hover:underline">
              <Paperclip className="size-3.5" aria-hidden /> Attachment {i + 1}
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}

const CHIP = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition';
const CHIP_ON = 'border-slate-950 bg-slate-950 text-white';
const CHIP_OFF = 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';

function PastEmails({ data }: { data: HarnessFeedback }) {
  const bring = useImportFeedbackEmails();
  const now = useHqClock().getTime();
  const p = data.pastEmails;
  return (
    <Section
      title="Emails from before this page existed"
      description="Until now a message from the contact form was only an email in the support inbox. The email service keeps what it sent for about 30 days, so that much can still be brought in here. Older emails stay in the inbox."
    >
      <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          disabled={bring.isPending || p.running || p.possible === false}
          onClick={() => bring.mutate(undefined, { onSuccess: () => toast.success('Started. This takes a few minutes.'), onError: (e) => toast.error(errorMessage(e, 'Could not start it')) })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 text-[13px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          {p.running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Inbox className="size-3.5" aria-hidden />} Bring in the last 30 days
        </button>
        <p className="min-w-[14rem] flex-1 text-[13px] leading-relaxed text-slate-600" role="status">
          {p.possible === false
            ? 'The server has no key for the email service, so past emails cannot be read.'
            : p.running
              ? `Looking through sent emails: ${p.scanned.toLocaleString()} looked at, ${p.found} from the contact form so far.`
              : p.error
                ? `It stopped: ${p.error}${p.added ? ` ${p.added} were brought in before that.` : ''}`
                : p.finishedAt
                  ? `Done ${formatRelative(p.finishedAt, now)}: ${p.found} contact-form ${p.found === 1 ? 'email' : 'emails'} found, ${p.added} of them new here.`
                  : 'Not done yet. Bringing the same email in twice keeps one copy.'}
        </p>
      </Panel>
    </Section>
  );
}

export default function FeedbackPage() {
  const { data, error, isLoading, refetch } = useHarnessFeedback();
  const read = useReadFeedback();
  const now = useHqClock().getTime();
  const [kind, setKind] = useState<KindFilter>('all');
  const [language, setLanguage] = useState<LanguageFilter>('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [highlight, setHighlight] = useState<number | null>(null);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const counts = useMemo(() => countByKind(items), [items]);
  const filtered = useMemo(() => filterFeedback(items, { kind, language, search }), [items, kind, language, search]);
  const visible = filtered.slice(0, shown);

  /** From a theme in the recap to the message itself: clear the filters, show enough of the list, scroll to it. */
  const open = (n: number) => {
    const index = items.findIndex((i) => i.number === n);
    if (index < 0) return;
    setKind('all');
    setLanguage('all');
    setSearch('');
    setShown((s) => Math.max(s, index + 1));
    setHighlight(n);
    // After the list has grown to include it.
    setTimeout(() => document.getElementById(`feedback-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  return (
    <div className={HQ_PAGE}>
      <Hero
        eyebrow="From players"
        title="Feedback"
        glow={GLOW}
        description="Everything players write to us: the contact form, the Season 3 idea survey and the comments left after a game. An agent reads all of it, writes the recap, and puts other languages into English."
        aside={
          <button
            type="button"
            className={cn(ON_HERO, 'disabled:opacity-50')}
            disabled={read.isPending || !data || data.reading || data.total === 0}
            onClick={() => read.mutate(undefined, { onSuccess: () => toast.success('The Feedback Reader started. A few minutes.'), onError: (e) => toast.error(errorMessage(e, 'Could not start it')) })}
          >
            {data?.reading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            {data?.reading ? 'Reading…' : 'New recap'}
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <HeroStat label="All feedback" value={data ? data.total.toLocaleString() : '…'} note={data && data.total > items.length ? `the newest ${items.length} are below` : undefined} />
          <HeroStat label="Last 7 days" value={data ? data.stats.last7Days.toLocaleString() : '…'} note={data ? `${data.stats.last30Days.toLocaleString()} in 30 days` : undefined} />
          <HeroStat label="Bugs reported" value={data ? data.stats.bugs.toLocaleString() : '…'} tone={data && data.stats.bugs > 0 ? 'attention' : undefined} />
          <HeroStat label="Put into English" value={data ? data.stats.translated.toLocaleString() : '…'} note={data?.waiting ? `${data.waiting} not read yet` : 'Georgian stays as written'} />
        </div>
      </Hero>

      {error && !data ? (
        <LoadErrorState error={error} fallback="Could not load the feedback" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the feedback…
        </div>
      ) : (
        <>
          {error && <RefreshErrorBanner />}

          <Section
            title={
              <>
                <Sparkles className="size-4 text-slate-400" aria-hidden /> The recap
              </>
            }
            description="What players are telling us, most common first. It is rewritten by itself when new feedback comes in, at most once an hour."
          >
            <Recap data={data} onOpen={open} />
          </Section>

          <Section
            title="Everything players wrote"
            count={filtered.length}
            description={`Newest first. Georgian is shown as written; other languages have the English next to the original.${data.total > items.length ? ` Only the newest ${items.length.toLocaleString()} of ${data.total.toLocaleString()} are listed, and the filters work on those.` : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of feedback">
                {KINDS.filter((k) => k.key === 'all' || counts[k.key] > 0).map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    aria-pressed={kind === k.key}
                    onClick={() => {
                      setKind(k.key);
                      setShown(PAGE_SIZE);
                    }}
                    className={cn(CHIP, kind === k.key ? CHIP_ON : CHIP_OFF)}
                  >
                    {k.label} <span className={cn('tabular-nums', kind === k.key ? 'text-white/70' : 'text-slate-400')}>{counts[k.key]}</span>
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="feedback-language">
                Language
              </label>
              <select
                id="feedback-language"
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value as LanguageFilter);
                  setShown(PAGE_SIZE);
                }}
                className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700"
              >
                <option value="all">Every language</option>
                <option value="ka">Georgian only</option>
                <option value="translated">Translated only</option>
              </select>
              <div className="relative ml-auto min-w-[12rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShown(PAGE_SIZE);
                  }}
                  placeholder="Search the feedback"
                  aria-label="Search the feedback"
                  className="h-8 w-full rounded-full border border-slate-200 bg-white pl-8 pr-3 text-[13px] text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>
            </div>

            {items.length === 0 ? (
              <EmptyState>No feedback yet. From now on every message from the contact form lands here as well as in the inbox.</EmptyState>
            ) : filtered.length === 0 ? (
              <EmptyState>Nothing matches. Try another filter or a shorter search.</EmptyState>
            ) : (
              <div className="space-y-3">
                {visible.map((f) => (
                  <FeedbackCard key={f.id} f={f} now={now} highlighted={highlight === f.number} />
                ))}
                {filtered.length > visible.length && (
                  <button type="button" onClick={() => setShown((s) => s + PAGE_SIZE)} className="mx-auto flex h-9 items-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
                    Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more ({filtered.length - visible.length} left)
                  </button>
                )}
              </div>
            )}
          </Section>

          <PastEmails data={data} />
        </>
      )}
    </div>
  );
}
