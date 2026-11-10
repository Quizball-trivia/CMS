'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  QUIZ_PAGE_EDITION_LOCALES,
  QUIZ_PAGE_EDITION_TEXT_FIELDS,
  QUIZ_PAGE_LOCALES,
  type QuizAboutBlock,
  type QuizPageEditionCopy,
  type QuizPageEditionLocale,
  type QuizPageInput,
  type QuizPageLocale,
  type QuizPageLocaleReadiness,
} from '@/types';

export const LOCALE_NAMES: Record<QuizPageLocale, string> = {
  en: 'English',
  ka: 'Georgian',
  es: 'Spanish',
  ru: 'Russian',
  pt: 'Portuguese (BR)',
  de: 'German',
  tr: 'Turkish',
  fr: 'French',
};

const HUB_FOLDER: Record<QuizPageLocale, string> = {
  en: 'football-quiz',
  ka: 'football-quiz',
  es: 'quiz-de-futbol',
  ru: 'futbolnaya-viktorina',
  pt: 'quiz-de-futebol',
  de: 'fussball-quiz',
  tr: 'futbol-bilgi-yarismasi',
  fr: 'quiz-foot',
};

const FIELD_LABELS: Record<(typeof QUIZ_PAGE_EDITION_TEXT_FIELDS)[number], { label: string; long?: boolean }> = {
  title: { label: 'Quiz name' },
  h1: { label: 'H1' },
  seo_title: { label: 'Title tag' },
  meta_description: { label: 'Meta description', long: true },
  breadcrumb_label: { label: 'Breadcrumb label' },
  lede: { label: 'Lede', long: true },
  about_heading: { label: 'About heading' },
  hero_image_alt: { label: 'Hero alt text' },
  og_image_alt: { label: 'OG alt text' },
  score_cta: { label: 'Score-screen CTA', long: true },
  footer_banner_text: { label: 'Footer banner', long: true },
  footer_button_label: { label: 'Footer button label' },
};

export const emptyEdition = (): QuizPageEditionCopy => ({
  ...Object.fromEntries(QUIZ_PAGE_EDITION_TEXT_FIELDS.map((field) => [field, null])) as Record<
    (typeof QUIZ_PAGE_EDITION_TEXT_FIELDS)[number],
    null
  >,
  about_blocks: null,
});

/** The English text a translated field answers to, so the translator sees both side by side. */
function englishText(form: QuizPageInput, field: (typeof QUIZ_PAGE_EDITION_TEXT_FIELDS)[number]): string {
  if (field === 'title') return form.title || form.h1;
  return (form[field] as string | null | undefined) ?? '';
}

/** A translated block's text, found by the English block's id (blocks can be added, removed and reordered). */
export function translatedBlockText(translated: QuizAboutBlock[] | null | undefined, id: string): string {
  return translated?.find((block) => block.id === id)?.text ?? '';
}

/**
 * Translated about blocks in the English order with the English ids and types (what the page and the readiness check
 * expect). Blocks not translated yet are left out, so a draft still saves; readiness then reports the language as
 * incomplete. No translated block at all is sent as "none".
 */
export function alignedBlocks(english: QuizAboutBlock[], translated: QuizAboutBlock[] | null): QuizAboutBlock[] | null {
  const aligned = english
    .map((block) => ({ id: block.id, type: block.type, text: translatedBlockText(translated, block.id) }))
    .filter((block) => block.text.trim());
  return aligned.length > 0 ? aligned : null;
}

/** Georgian before the backend returned editions: its four legacy fields are its copy. */
export function georgianFromLegacy(form: Pick<QuizPageInput, 'ka_h1' | 'ka_lede' | 'ka_seo_title' | 'ka_meta_description'>): QuizPageEditionCopy {
  return { ...emptyEdition(), h1: form.ka_h1, lede: form.ka_lede, seo_title: form.ka_seo_title, meta_description: form.ka_meta_description };
}

/**
 * The URLs to send: values the editor typed, and the page slug for a language whose custom URL was cleared before
 * the page went live (leaving it out would keep the old custom URL).
 */
export function publicSlugsForSave(form: QuizPageInput): QuizPageInput['public_slugs'] {
  return Object.fromEntries(Object.entries(form.public_slugs ?? {})
    .filter(([locale]) => locale !== 'en' && locale !== 'ka')
    .map(([locale, value]) => [locale, value || form.slug])
    .filter(([, value]) => value)) as QuizPageInput['public_slugs'];
}

/** Every language as the backend stores it, with Georgian's four legacy fields kept in step with its edition. */
export function editionsForSave(form: QuizPageInput): Pick<QuizPageInput, 'editions' | 'ka_h1' | 'ka_lede' | 'ka_seo_title' | 'ka_meta_description'> {
  const editions = Object.fromEntries(Object.entries(form.editions ?? {}).map(([locale, edition]) => [
    locale,
    { ...edition, about_blocks: alignedBlocks(form.about_blocks, edition?.about_blocks ?? null) },
  ])) as QuizPageInput['editions'];
  const georgian = editions?.ka;
  return {
    editions,
    ka_h1: georgian ? georgian.h1 : form.ka_h1,
    ka_lede: georgian ? georgian.lede : form.ka_lede,
    ka_seo_title: georgian ? georgian.seo_title : form.ka_seo_title,
    ka_meta_description: georgian ? georgian.meta_description : form.ka_meta_description,
  };
}

export function QuizPageLanguages({
  form,
  readiness,
  stale = false,
  publishedSlugs,
  onEditionChange,
  onPublicSlugChange,
  onLocaleModeChange,
}: {
  form: QuizPageInput;
  readiness: QuizPageLocaleReadiness[] | undefined;
  /** The form has changes the checks have not seen yet. */
  stale?: boolean;
  /** URLs that are live and therefore fixed. */
  publishedSlugs: Partial<Record<QuizPageLocale, string>>;
  onEditionChange: (locale: QuizPageEditionLocale, edition: QuizPageEditionCopy) => void;
  onPublicSlugChange: (locale: QuizPageLocale, slug: string) => void;
  onLocaleModeChange: (mode: QuizPageInput['locale_mode']) => void;
}) {
  const [active, setActive] = useState<QuizPageEditionLocale>('ka');
  const byLocale = new Map((readiness ?? []).map((entry) => [entry.locale, entry]));
  const edition = form.editions?.[active] ?? (active === 'ka' ? georgianFromLegacy(form) : emptyEdition());
  const update = (next: Partial<QuizPageEditionCopy>) => onEditionChange(active, { ...edition, ...next });
  const slugLocked = Boolean(publishedSlugs[active]);
  const english = byLocale.get('en');

  return (
    <div className="space-y-6">
      {stale && <p className="text-xs font-semibold text-slate-500">Unsaved changes: these checks are from the last save.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUIZ_PAGE_LOCALES.map((locale) => {
          const status = byLocale.get(locale);
          return (
            <div key={locale} className={`rounded-xl border px-3 py-2 ${status?.ready ? 'border-emerald-200 bg-emerald-50' : status ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                {status?.ready ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : status ? <AlertTriangle className="size-3.5 text-amber-600" /> : null}
                {LOCALE_NAMES[locale]}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                {status ? (status.ready ? 'Complete and playable' : `${status.problems.length} to fix`) : 'Save to check'}
              </p>
            </div>
          );
        })}
      </div>
      {english && !english.ready && (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {english.problems.slice(0, 8).map((problem) => <li key={problem}>English · {problem}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Language">
        {QUIZ_PAGE_EDITION_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            role="tab"
            aria-selected={active === locale}
            onClick={() => setActive(locale)}
            className={`rounded-full border px-3 py-1.5 text-xs font-black ${active === locale ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
          >
            {LOCALE_NAMES[locale]}
          </button>
        ))}
      </div>

      {active === 'ka' && (
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={form.locale_mode === 'en_ka'} onChange={(event) => onLocaleModeChange(event.target.checked ? 'en_ka' : 'en_only')} />
          Publish the Georgian page
        </label>
      )}

      {byLocale.get(active) && !byLocale.get(active)!.ready && (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {byLocale.get(active)!.problems.filter((problem) => !problem.startsWith('en ')).slice(0, 10).map((problem) => <li key={problem}>• {problem}</li>)}
        </ul>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-bold text-slate-800">URL</Label>
        <div className="flex h-11 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">/{active}/{HUB_FOLDER[active]}/</span>
          <input
            value={active === 'ka' ? form.slug : form.public_slugs?.[active] ?? ''}
            onChange={(event) => onPublicSlugChange(active, event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={active === 'ka' || slugLocked}
            placeholder={form.slug || 'slug'}
            className="min-w-0 flex-1 px-3 font-mono text-sm outline-none disabled:bg-slate-50 disabled:text-slate-500"
          />
          {(active === 'ka' || slugLocked) && <span className="flex items-center px-3 text-slate-400"><Lock className="size-3.5" /></span>}
        </div>
        <p className="text-xs text-slate-400">
          {active === 'ka' ? 'Georgian shares the English folder and slug.' : slugLocked ? 'Live URLs stay fixed.' : 'Empty uses the page slug.'}
        </p>
      </div>

      <div className="grid gap-5">
        {QUIZ_PAGE_EDITION_TEXT_FIELDS.map((field) => {
          const { label, long } = FIELD_LABELS[field];
          const source = englishText(form, field);
          if (!source && field === 'og_image_alt') return null;
          const value = edition[field] ?? '';
          return (
            <div key={field} className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-800">{label}</Label>
              {source && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">{source}</p>}
              {long
                ? <Textarea value={value} onChange={(event) => update({ [field]: event.target.value || null })} className="min-h-24 rounded-xl" />
                : <Input value={value} onChange={(event) => update({ [field]: event.target.value || null })} className="h-11 rounded-xl" />}
            </div>
          );
        })}
        <div className="space-y-3">
          <Label className="text-sm font-bold text-slate-800">About blocks</Label>
          {form.about_blocks.map((block) => (
            <div key={block.id} className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs leading-5 text-slate-500">{block.text}</p>
              <Textarea
                value={translatedBlockText(edition.about_blocks, block.id)}
                onChange={(event) => {
                  const others = (edition.about_blocks ?? []).filter((translated) => translated.id !== block.id);
                  update({ about_blocks: [...others, { id: block.id, type: block.type, text: event.target.value }] });
                }}
                className="min-h-24 rounded-xl bg-white"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
