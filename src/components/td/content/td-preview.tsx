'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle2, ImageOff, Loader2 } from 'lucide-react';
import { releasedImage } from '@/components/td/media/td-media';
import { TdCardImage } from './td-card-image';
import { useTdAllRows, useTdUploadUrl } from '@/hooks/use-td-content';
import type { TdContentData, TdContentType } from '@/lib/td/admin-api';
import { t } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';
import { gameImageSrc } from '@/lib/td/game-images';
import { legacyImageSrc } from '@/lib/td/legacy-images';

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

const LABEL = 'text-[10px] font-black uppercase tracking-widest text-slate-400';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className={LABEL}>{label}</p>
      {children}
    </div>
  );
}

function Prompt({ value }: { value: unknown }) {
  return <p className="text-lg font-semibold leading-snug text-slate-900">{text(value) ?? t('Untitled question')}</p>;
}

/** Rows read in order (clues, clue lines, items), as the Quizball dialog lists its options. */
function Rows({ lines }: { lines: readonly unknown[] }) {
  const shown = lines.map(text).filter((line): line is string => line !== null);
  if (!shown.length) return <p className="text-sm text-slate-400">{t('Nothing to show yet.')}</p>;
  return (
    <div className="mt-1 grid gap-2">
      {shown.map((line, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">{i + 1}</span>
          <span className="flex-1 text-sm font-medium text-slate-600">{line}</span>
        </div>
      ))}
    </div>
  );
}

/** The answer and its other accepted spellings: the Quizball dialog's "Accepted Answers". */
function AcceptedAnswers({ display, accepted }: { display: unknown; accepted?: readonly unknown[] }) {
  const all = [text(display), ...(accepted ?? []).map(text)].filter((a): a is string => a !== null);
  const answers = [...new Set(all)];
  return (
    <Section label={t('Accepted Answers')}>
      <div className="mt-1 grid gap-2">
        {answers.map((answer, index) => (
          <div key={answer} className="flex items-center gap-4 rounded-xl border border-emerald-500 bg-emerald-50 p-4 shadow-[0_2px_10px_rgba(16,185,129,0.1)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-white">{index + 1}</span>
            <span className="flex-1 text-sm font-medium text-emerald-900">{answer}</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </span>
          </div>
        ))}
        {!answers.length && <p className="text-sm text-slate-400">{t('Nothing to show yet.')}</p>}
      </div>
    </Section>
  );
}

// The Quizball dialog's compact image frame (components/questions/question-image-preview.tsx).
const FRAME = 'relative flex aspect-[4/3] max-h-72 min-h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-950/5';

function UploadedImage({ uploadId, alt }: { uploadId: string; alt: string }) {
  const file = useTdUploadUrl(uploadId);
  if (file.url)
    return (
      <div className={FRAME}>
        {/* eslint-disable-next-line @next/next/no-img-element -- an object URL of an authenticated download */}
        <img src={file.url} alt={alt} className="h-full w-full object-contain" />
      </div>
    );
  return <div className={cn(FRAME, 'text-slate-400')}>{file.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageOff className="h-6 w-6" />}</div>;
}

/** An image of the game by its path, fetched through /td/game-image; one that is not there shows its path. */
function GameImage({ src, path }: { src: string; path: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className={cn(FRAME, 'flex-col gap-2 px-4 text-center text-sm text-slate-500')}>
        <ImageOff className="h-6 w-6" />
        <span className="max-w-full truncate font-mono text-xs">{path}</span>
        <span className="text-xs">{t('The game has no picture at this path.')}</span>
      </div>
    );
  return (
    <div className={FRAME}>
      {/* eslint-disable-next-line @next/next/no-img-element -- served from this origin by /td/game-image */}
      <img src={src} alt="" onError={() => setFailed(true)} className="h-full w-full object-contain" />
    </div>
  );
}

/** An image the row shows: an uploaded image by its media key, or one kept by URL or path. */
export function TdQuestionImage({ imageKey, src }: { imageKey?: string | null; src?: string | null }) {
  const media = useTdAllRows('media', {}, Boolean(imageKey));
  if (imageKey) {
    const found = media.data?.rows.find((r) => r.data.key === imageKey);
    // The approved image, as releases show it (a replacement waiting for approval is not it yet).
    const row = found ? { data: releasedImage(found) } : undefined;
    const uploadId = row?.data.uploadId ?? null;
    if (uploadId) return <UploadedImage uploadId={uploadId} alt={imageKey} />;
    if (media.isLoading) return <div className={cn(FRAME, 'text-slate-400')}><Loader2 className="h-6 w-6 animate-spin" /></div>;
    src = row?.data.url ?? src;
    if (!src)
      return (
        <div className={cn(FRAME, 'flex-col gap-2 px-4 text-center text-sm text-slate-500')}>
          <ImageOff className="h-6 w-6" />
          {t('No uploaded image is called {name}.', { name: imageKey })}
        </div>
      );
  }
  if (!src) return null;
  const legacy = legacyImageSrc(src);
  if (legacy)
    return (
      <div className={FRAME}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served from this origin by /td/legacy-image */}
        <img src={legacy} alt={imageKey ?? ''} className="h-full w-full object-contain" />
      </div>
    );
  const game = gameImageSrc(src);
  if (game) return <GameImage key={game} src={game} path={src} />;
  // Other images kept by URL are not loaded here (the CMS loads its own files only): the link opens them.
  return (
    <a href={src} target="_blank" rel="noreferrer noopener" className={cn(FRAME, 'flex-col gap-2 px-4 text-center text-sm text-slate-500 hover:text-slate-900')}>
      <ImageOff className="h-6 w-6" />
      <span className="max-w-full truncate font-mono text-xs">{src}</span>
    </a>
  );
}

/** How the row reads, laid out as the Quizball CMS's question preview: the
 *  question, its image, its options or clues, then the accepted answers. It
 *  follows the form as it is typed, saved or not. */
export function TdPreview({ type, data }: { type: TdContentType; data: Record<string, unknown> }) {
  switch (type) {
    case 'cards': {
      const d = data as TdContentData<'cards'>;
      return (
        <div className="space-y-4">
          {(d.imageKey || d.photo) && (
            <Section label={t('Image')}>
              <div className="mx-auto aspect-[3/4] w-48 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <TdCardImage card={d} />
              </div>
            </Section>
          )}
          <Section label={t('Clue lines')}>
            <Rows lines={d.lines} />
          </Section>
          <AcceptedAnswers display={d.display} accepted={d.aliases} />
        </div>
      );
    }
    case 'whoami-subjects': {
      const d = data as TdContentData<'whoami-subjects'>;
      return (
        <div className="space-y-4">
          <Section label={t('Clues, read out one by one')}>
            <Rows lines={d.clues} />
          </Section>
          <AcceptedAnswers display={d.display} accepted={d.aliases} />
        </div>
      );
    }
    case 'box-questions':
    case 'penalty-questions': {
      const d = data as TdContentData<'penalty-questions'>;
      return (
        <div className="space-y-4">
          <Section label={t('Question')}>
            <Prompt value={d.q} />
          </Section>
          <AcceptedAnswers display={d.display} accepted={d.aliases} />
        </div>
      );
    }
    case 'practice-questions': {
      const d = data as TdContentData<'practice-questions'>;
      return (
        <div className="space-y-4">
          <Section label={t('Question')}>
            <Prompt value={d.prompt} />
          </Section>
          {d.imageKey && (
            <Section label={t('Image')}>
              <TdQuestionImage imageKey={d.imageKey} />
            </Section>
          )}
          <Section label={t('Options')}>
            <div className="mt-1 grid gap-2">
              {d.options.map((option, index) => {
                const right = index === d.answer;
                return (
                  <div
                    key={index}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border p-3 transition-all duration-300',
                      right ? 'border-emerald-500 bg-emerald-50 shadow-[0_2px_10px_rgba(16,185,129,0.1)]' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50',
                    )}
                  >
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition-colors', right ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200')}>
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className={cn('flex-1 text-sm font-medium transition-colors', right ? 'text-emerald-900' : 'text-slate-600')}>{text(option) ?? t('Option {n}', { n: index + 1 })}</span>
                    {right && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
          {text(d.explanation) && (
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className={LABEL}>{t('Explanation')}</p>
              <p className="text-sm font-medium leading-relaxed text-slate-600">{d.explanation}</p>
            </div>
          )}
        </div>
      );
    }
    case 'football-logic': {
      const d = data as TdContentData<'football-logic'>;
      return (
        <div className="space-y-4">
          <Section label={t('Question')}>
            <Prompt value={d.prompt} />
          </Section>
          {(d.imageA || d.imageB) && (
            <Section label={t('Images')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {d.imageA && <TdQuestionImage src={d.imageA} />}
                {d.imageB && <TdQuestionImage src={d.imageB} />}
              </div>
            </Section>
          )}
          <AcceptedAnswers display={d.displayAnswer} accepted={d.acceptedAnswers} />
        </div>
      );
    }
    case 'put-in-order': {
      const d = data as TdContentData<'put-in-order'>;
      const ordered = [...d.items].sort((a, b) => a.sortValue - b.sortValue);
      return (
        <div className="space-y-4">
          <Section label={t('Question')}>
            <Prompt value={d.prompt} />
          </Section>
          <Section label={t('Items')}>
            <Rows lines={d.items.map((item) => item.label)} />
          </Section>
          <Section label={t('Correct Order')}>
            <div className="mt-1 grid gap-2">
              {ordered.map((item, index) => (
                <div key={item.key} className="flex items-center gap-4 rounded-xl border border-emerald-500 bg-emerald-50 p-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-white">{index + 1}</span>
                  <span className="flex-1 text-sm font-medium text-emerald-900">{text(item.label) ?? '—'}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      );
    }
    case 'career-path': {
      const d = data as TdContentData<'career-path'>;
      return (
        <div className="space-y-4">
          <Section label={t('Question')}>
            <Prompt value={d.prompt} />
          </Section>
          <Section label={t('Clubs')}>
            <Rows lines={d.clubs.map((club) => club.name)} />
          </Section>
          <AcceptedAnswers display={d.displayAnswer} accepted={d.acceptedAnswers} />
        </div>
      );
    }
    default:
      return null;
  }
}
