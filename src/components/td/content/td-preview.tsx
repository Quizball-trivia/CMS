import type { ReactNode } from 'react';
import { ImageIcon } from 'lucide-react';
import type { TdContentData, TdContentType } from '@/lib/td/admin-api';
import { t, tn, tr } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';

/** The types a player meets as a question or a card. */
const PREVIEWED = new Set<TdContentType>([
  'cards',
  'whoami-subjects',
  'box-questions',
  'penalty-questions',
  'practice-questions',
  'football-logic',
  'put-in-order',
  'career-path',
]);

export const hasPreview = (type: TdContentType) => PREVIEWED.has(type);

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

const PRACTICE_LABELS: Record<string, string> = {
  easy: t('Practice · easy'),
  medium: t('Practice · medium'),
  hard: t('Practice · hard'),
};

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-inner">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Lines({ lines, numbered }: { lines: readonly unknown[]; numbered?: boolean }) {
  const shown = lines.map(text).filter((line): line is string => line !== null);
  if (!shown.length) return <p className="text-sm text-slate-500">{t('Nothing to show yet.')}</p>;
  return (
    <ol className="flex flex-col gap-2">
      {shown.map((line, i) => (
        <li key={i} className="flex gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
          {numbered && <span className="w-4 shrink-0 text-right tabular-nums text-slate-500">{i + 1}</span>}
          <span>{line}</span>
        </li>
      ))}
    </ol>
  );
}

function Picture({ name }: { name: unknown }) {
  if (!text(name)) return null;
  return (
    <p className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400">
      <ImageIcon className="size-3.5" />
      {tr('Shown with the image {name}', {
        name: (
          <span key="name" className="font-mono text-slate-300">
            {String(name)}
          </span>
        ),
      })}
    </p>
  );
}

function Answer({ display, accepted }: { display: unknown; accepted?: readonly unknown[] }) {
  const also = (accepted ?? []).map(text).filter((a): a is string => a !== null);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('Answer')}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{text(display) ?? '—'}</p>
      {also.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {t('Also accepted:')}
          {also.map((a) => (
            <span key={a} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
              {a}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** How the row reads to a player: what the game shows, then the answer it accepts.
 *  It follows the form as it is typed, saved or not. */
export function TdPreview({ type, data }: { type: TdContentType; data: Record<string, unknown> }) {
  switch (type) {
    case 'cards': {
      const d = data as TdContentData<'cards'>;
      return (
        <div className="flex flex-col gap-4">
          <Frame label={tn(d.value, 'Card · {count} point', 'Card · {count} points')}>
            <Picture name={d.imageKey ?? d.photo} />
            <Lines lines={d.lines} />
          </Frame>
          <Answer display={d.display} accepted={d.aliases} />
        </div>
      );
    }
    case 'whoami-subjects': {
      const d = data as TdContentData<'whoami-subjects'>;
      return (
        <div className="flex flex-col gap-4">
          <Frame label={t('Clues, read out one by one')}>
            <Lines lines={d.clues} numbered />
          </Frame>
          <Answer display={d.display} accepted={d.aliases} />
        </div>
      );
    }
    case 'box-questions':
    case 'penalty-questions': {
      const d = data as TdContentData<'penalty-questions'>;
      return (
        <div className="flex flex-col gap-4">
          <Frame label={type === 'penalty-questions' ? t('Penalty question') : t('Question')}>
            <p className="text-lg font-semibold leading-snug">{text(d.q) ?? t('The question appears here.')}</p>
          </Frame>
          <Answer display={d.display} accepted={d.aliases} />
        </div>
      );
    }
    case 'practice-questions': {
      const d = data as TdContentData<'practice-questions'>;
      return (
        <div className="flex flex-col gap-4">
          <Frame label={PRACTICE_LABELS[d.difficulty] ?? t('Practice')}>
            <Picture name={d.imageKey} />
            <p className="text-lg font-semibold leading-snug">{text(d.prompt) ?? t('The question appears here.')}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.options.map((option, i) => (
                <li key={i} className={cn('rounded-xl px-3 py-2 text-sm', i === d.answer ? 'bg-emerald-500/20 font-semibold text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-white/5')}>
                  {text(option) ?? t('Option {n}', { n: i + 1 })}
                </li>
              ))}
            </ul>
          </Frame>
          {text(d.explanation) && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{d.explanation}</p>}
        </div>
      );
    }
    case 'football-logic': {
      const d = data as TdContentData<'football-logic'>;
      return (
        <div className="flex flex-col gap-4">
          <Frame label={t('Football Logic')}>
            <Picture name={d.imageA} />
            <Picture name={d.imageB} />
            <p className="text-lg font-semibold leading-snug">{text(d.prompt) ?? t('The question appears here.')}</p>
          </Frame>
          <Answer display={d.displayAnswer} accepted={d.acceptedAnswers} />
        </div>
      );
    }
    case 'put-in-order': {
      const d = data as TdContentData<'put-in-order'>;
      const ordered = [...d.items].sort((a, b) => a.sortValue - b.sortValue);
      return (
        <div className="flex flex-col gap-4">
          <Frame label={t('Put in Order')}>
            <p className="text-lg font-semibold leading-snug">{text(d.prompt) ?? t('The question appears here.')}</p>
            <Lines lines={d.items.map((item) => item.label)} />
          </Frame>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('Right order')}</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{ordered.map((item) => text(item.label) ?? '—').join(' → ')}</p>
          </div>
        </div>
      );
    }
    case 'career-path': {
      const d = data as TdContentData<'career-path'>;
      return (
        <div className="flex flex-col gap-4">
          <Frame label={t('Career Path')}>
            <p className="text-lg font-semibold leading-snug">{text(d.prompt) ?? t('Whose career is this?')}</p>
            <p className="text-sm text-slate-300">{d.clubs.map((club) => text(club.name) ?? '—').join(' → ')}</p>
          </Frame>
          <Answer display={d.displayAnswer} accepted={d.acceptedAnswers} />
        </div>
      );
    }
    default:
      return null;
  }
}
