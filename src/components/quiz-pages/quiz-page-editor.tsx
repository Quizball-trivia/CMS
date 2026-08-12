'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Code2,
  Database,
  Eye,
  FileText,
  Globe2,
  History,
  ImagePlus,
  Languages,
  Link2,
  Loader2,
  Plus,
  Save,
  SearchCheck,
  Send,
  Settings2,
  Trash2,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { campaignQuizPagesService } from '@/services';
import {
  useCreateQuizPage,
  useDeleteQuizPage,
  usePreviewQuizPage,
  usePublishQuizPage,
  useQuizPageRevisions,
  useQuizPages,
  useQuizQuestionSets,
  useRestoreQuizPageRevision,
  useUnpublishQuizPage,
  useUpdateQuizPage,
} from '@/hooks';
import { generateAnswerId } from '@/lib/question-utils';
import type {
  QuizAboutBlock,
  QuizPage,
  QuizPageGooglebotInspection,
  QuizPageInput,
  QuizPageRetireInput,
} from '@/types';
import { EMPTY_QUIZ_PAGE } from '@/types';
import { ApiClientError } from '@/services/api-client';
import {
  formatManualQuestions,
  MANUAL_QUESTION_EXAMPLE,
  parseManualQuestions,
} from './manual-question-format';

function words(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function withVerifiedCount(value: string, count: number): string {
  return value.replaceAll('{count}', String(count));
}

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.details && typeof error.details === 'object' && 'blockers' in error.details) {
      const blockers = (error.details as { blockers?: unknown }).blockers;
      if (Array.isArray(blockers)) return blockers.join(' ');
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function safePreviewUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function inputFromPage(page: QuizPage): QuizPageInput {
  return {
    internal_name: page.internal_name,
    slug: page.slug,
    category: page.category,
    h1: page.h1,
    lede: page.lede,
    question_source: page.question_source,
    question_set_slug: page.question_set_slug,
    manual_questions: page.manual_questions,
    about_heading: page.about_heading,
    about_blocks: page.about_blocks,
    score_cta: page.score_cta,
    footer_banner_text: page.footer_banner_text,
    footer_button_label: page.footer_button_label,
    related_slugs: page.related_slugs,
    hero_image_url: page.hero_image_url,
    hero_image_alt: page.hero_image_alt,
    seo_title: page.seo_title,
    meta_description: page.meta_description,
    og_image_url: page.og_image_url,
    og_image_alt: page.og_image_alt,
    breadcrumb_label: page.breadcrumb_label,
    locale_mode: page.locale_mode,
    ka_seo_title: page.ka_seo_title,
    ka_meta_description: page.ka_meta_description,
    ka_h1: page.ka_h1,
    ka_lede: page.ka_lede,
  };
}

function Field({ label, hint, counter, children }: { label: string; hint?: string; counter?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div><Label className="text-sm font-bold text-slate-800">{label}</Label>{hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}</div>
        {counter && <span className="shrink-0 text-xs font-semibold text-slate-400">{counter}</span>}
      </div>
      {children}
    </div>
  );
}

function Section({ icon: Icon, eyebrow, title, description, children }: {
  icon: typeof FileText;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex gap-4 border-b border-slate-100 px-6 py-5">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="size-5" /></div>
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p><h2 className="mt-1 text-xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      </div>
      <div className="space-y-6 p-6">{children}</div>
    </section>
  );
}

function ImageUploader({ label, value, alt, kind, slug, onUploaded, onAltChange }: {
  label: string;
  value: string | null;
  alt: string;
  kind: 'hero' | 'og';
  slug: string;
  onUploaded: (url: string | null) => void;
  onAltChange: (alt: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    if (!slug) return toast.error('Add the slug before uploading artwork.');
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const result = await campaignQuizPagesService.uploadImage(dataUrl, kind, slug);
      onUploaded(result.url);
      const destination = result.environment === 'prod'
        ? 'production'
        : result.environment;
      toast.success(`${label} uploaded to ${destination} media`);
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-bold text-slate-800">{label}</Label>
      <label className="group relative flex min-h-52 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-blue-400 hover:bg-blue-50/30">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <div className={`relative z-10 flex flex-col items-center rounded-2xl px-5 py-4 text-center ${value ? 'bg-slate-950/75 text-white backdrop-blur-sm' : 'text-slate-500'}`}>
          {uploading ? <Loader2 className="mb-2 size-6 animate-spin" /> : <ImagePlus className="mb-2 size-6" />}
          <span className="text-sm font-bold">{value ? 'Replace artwork' : 'Upload artwork'}</span>
          <span className="mt-1 text-xs opacity-70">PNG, JPEG or WebP · cropped to square</span>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} />
      </label>
      {value && <button type="button" onClick={() => onUploaded(null)} className="text-xs font-bold text-red-600 hover:underline">Remove image</button>}
      <Field label="Alt text" hint={kind === 'hero' ? 'Required before publish.' : 'Required when using an OG override.'}>
        <Input value={alt} onChange={(event) => onAltChange(event.target.value)} placeholder="Describe the artwork for screen readers" className="h-11 rounded-xl" />
      </Field>
    </div>
  );
}

export function QuizPageEditor({ existing }: { existing?: QuizPage }) {
  const router = useRouter();
  const [form, setForm] = useState<QuizPageInput>(existing ? inputFromPage(existing) : EMPTY_QUIZ_PAGE);
  const [manualQuestionText, setManualQuestionText] = useState(() =>
    existing?.question_source === 'manual'
      ? formatManualQuestions(existing.manual_questions)
      : '',
  );
  const [currentSlug, setCurrentSlug] = useState(existing?.slug ?? '');
  const [savedPage, setSavedPage] = useState<QuizPage | undefined>(existing);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<'preview' | 'googlebot' | 'publish' | 'retire' | 'delete' | 'restore' | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireAction, setRetireAction] = useState<'retire' | 'delete'>('retire');
  const [scheduledAt, setScheduledAt] = useState('');
  const [routeMode, setRouteMode] = useState<'gone' | 'redirect'>('gone');
  const [targetSlug, setTargetSlug] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [googlebotOpen, setGooglebotOpen] = useState(false);
  const [googlebotResult, setGooglebotResult] = useState<QuizPageGooglebotInspection | null>(null);
  const { data: sets = [], isLoading: setsLoading } = useQuizQuestionSets();
  const { data: allPages = [] } = useQuizPages();
  const { data: revisions = [], refetch: refetchRevisions } = useQuizPageRevisions(currentSlug || undefined);
  const restoreRevision = useRestoreQuizPageRevision();
  const createPage = useCreateQuizPage();
  const updatePage = useUpdateQuizPage();
  const previewPage = usePreviewQuizPage();
  const publishPage = usePublishQuizPage();
  const unpublishPage = useUnpublishQuizPage();
  const deletePage = useDeleteQuizPage();

  const selectedSet = sets.find((set) => set.slug === form.question_set_slug);
  const manualParse = useMemo(
    () => parseManualQuestions(manualQuestionText),
    [manualQuestionText],
  );
  const manualDifficulty = useMemo(
    () => ({
      easy: manualParse.questions.filter((question) => question.difficulty === 'easy').length,
      medium: manualParse.questions.filter((question) => question.difficulty === 'medium').length,
      hard: manualParse.questions.filter((question) => question.difficulty === 'hard').length,
    }),
    [manualParse.questions],
  );
  const verifiedCount = form.question_source === 'manual'
    ? manualParse.questions.length
    : selectedSet?.count ?? savedPage?.question_count ?? 0;
  const renderedSeoTitle = withVerifiedCount(form.seo_title, verifiedCount);
  const renderedMetaDescription = withVerifiedCount(form.meta_description, verifiedCount);
  const renderedKaSeoTitle = withVerifiedCount(form.ka_seo_title ?? '', verifiedCount);
  const renderedKaMetaDescription = withVerifiedCount(
    form.ka_meta_description ?? '',
    verifiedCount,
  );
  const relatedOptions = useMemo(() => allPages.filter((page) => page.status === 'published' && page.slug !== form.slug && !form.related_slugs.includes(page.slug)), [allPages, form.related_slugs, form.slug]);
  const patch = <K extends keyof QuizPageInput>(key: K, value: QuizPageInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<QuizPage | null> => {
    if (form.question_source === 'manual' && manualParse.errors.length > 0) {
      toast.error(manualParse.errors[0]);
      return null;
    }
    setSaving(true);
    try {
      const previousSlug = currentSlug;
      const existingManualQuestions = savedPage?.manual_questions ?? form.manual_questions;
      const manualQuestionIds = new Map(
        existingManualQuestions.map((question) => [
          question.prompt.trim().toLocaleLowerCase('en'),
          question.id,
        ]),
      );
      const claimedManualQuestionIds = new Set(
        manualParse.questions.flatMap((question) => {
          const id = manualQuestionIds.get(
            question.prompt.trim().toLocaleLowerCase('en'),
          );
          return id ? [id] : [];
        }),
      );
      const manualQuestions = manualParse.questions.map((question, index) => {
        let id = manualQuestionIds.get(question.prompt.trim().toLocaleLowerCase('en'));
        const positionId = existingManualQuestions[index]?.id;
        if (!id && positionId && !claimedManualQuestionIds.has(positionId)) {
          id = positionId;
          claimedManualQuestionIds.add(positionId);
        }
        return { ...question, id };
      });
      const input: QuizPageInput = {
        ...form,
        question_set_slug: form.question_source === 'manual' ? form.slug : form.question_set_slug,
        manual_questions: form.question_source === 'manual'
          ? manualQuestions
          : [],
      };
      const page = currentSlug
        ? await updatePage.mutateAsync({ currentSlug, input })
        : await createPage.mutateAsync(input);
      setCurrentSlug(page.slug);
      setSavedPage(page);
      setForm(inputFromPage(page));
      setManualQuestionText(
        page.question_source === 'manual' ? formatManualQuestions(page.manual_questions) : '',
      );
      toast.success(page.status === 'published' ? 'Changes saved' : 'Draft saved');
      if (!previousSlug || previousSlug !== page.slug) {
        router.replace(`/quiz-pages/${page.slug}`);
      }
      return page;
    } catch (error) {
      toast.error(messageFor(error));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow) previewWindow.opener = null;
    setAction('preview');
    const page = await save();
    if (page) {
      try {
        const previewedPage = await previewPage.mutateAsync(page.slug);
        setSavedPage(previewedPage);
        const target = safePreviewUrl(previewedPage.preview_url);
        if (!target) {
          previewWindow?.close();
          toast.error('The preview URL is not valid.');
        } else if (previewWindow) {
          previewWindow.location.replace(target);
        } else {
          window.location.assign(target);
        }
      } catch (error) {
        previewWindow?.close();
        toast.error(messageFor(error));
      }
    } else {
      previewWindow?.close();
    }
    setAction(null);
  };

  const publish = async () => {
    setAction('publish');
    const page = await save();
    if (page) {
      try {
        const published = await publishPage.mutateAsync({
          slug: page.slug,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        });
        setSavedPage(published);
        setForm(inputFromPage(published));
        setPublishOpen(false);
        toast.success(scheduledAt ? 'Quiz page scheduled' : 'Quiz page published');
      } catch (error) { toast.error(messageFor(error)); }
    }
    setAction(null);
  };

  const inspectGooglebot = async () => {
    setGooglebotOpen(true);
    setGooglebotResult(null);
    setAction('googlebot');
    const page = await save();
    if (page) {
      try {
        setGooglebotResult(await campaignQuizPagesService.googlebot(page.slug));
      } catch (error) {
        toast.error(messageFor(error));
      }
    }
    setAction(null);
  };

  const restore = async (revisionId: number, revisionNumber: number) => {
    if (
      !currentSlug
      || !window.confirm(
        `Restore revision ${revisionNumber}? Your current saved content will remain in history.`,
      )
    ) return;
    setAction('restore');
    try {
      const page = await restoreRevision.mutateAsync({ slug: currentSlug, revisionId });
      setSavedPage(page);
      setForm(inputFromPage(page));
      setManualQuestionText(
        page.question_source === 'manual' ? formatManualQuestions(page.manual_questions) : '',
      );
      await refetchRevisions();
      setHistoryOpen(false);
      toast.success(`Revision ${revisionNumber} restored`);
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setAction(null);
    }
  };

  const retire = async () => {
    if (!currentSlug) return;
    if (routeMode === 'redirect' && !targetSlug) return toast.error('Choose the redirect destination.');
    setAction(retireAction);
    const input: QuizPageRetireInput = { route_mode: routeMode, target_slug: routeMode === 'redirect' ? targetSlug : null };
    try {
      if (retireAction === 'delete') await deletePage.mutateAsync({ slug: currentSlug, input });
      else await unpublishPage.mutateAsync({ slug: currentSlug, input });
      toast.success(retireAction === 'delete' ? 'Quiz page deleted' : 'Quiz page unpublished');
      router.push('/quiz-pages');
    } catch (error) { toast.error(messageFor(error)); }
    setAction(null);
  };

  const addBlock = () => patch('about_blocks', [...form.about_blocks, { id: generateAnswerId(), type: 'paragraph', text: '' }]);
  const updateBlock = (index: number, next: Partial<QuizAboutBlock>) => patch('about_blocks', form.about_blocks.map((block, i) => i === index ? { ...block, ...next } : block));
  const removeBlock = (index: number) => patch('about_blocks', form.about_blocks.filter((_, i) => i !== index));
  const moveRelated = (index: number, direction: -1 | 1) => {
    const next = [...form.related_slugs];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch('related_slugs', next);
  };

  const status = savedPage?.status ?? 'draft';
  const updateSlug = (value: string) => {
    const slug = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setForm((current) => ({
      ...current,
      slug,
      question_set_slug: current.question_source === 'manual' ? slug : current.question_set_slug,
    }));
  };
  const setQuestionSource = (source: QuizPageInput['question_source']) => {
    setForm((current) => ({
      ...current,
      question_source: source,
      question_set_slug:
        source === 'manual'
          ? current.slug
          : current.question_source === 'manual'
            ? ''
            : current.question_set_slug,
      manual_questions: source === 'manual' ? current.manual_questions : [],
    }));
  };
  const updateInternalName = (internalName: string) => {
    setForm((current) => ({
      ...current,
      internal_name: internalName,
      breadcrumb_label:
        !current.breadcrumb_label || current.breadcrumb_label === current.internal_name
          ? internalName
          : current.breadcrumb_label,
    }));
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] px-2 pb-16 text-slate-950">
      <div className="sticky top-0 z-30 -mx-8 mb-8 border-b border-slate-200/80 bg-[#f8f9fb]/95 px-8 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-xl"><Link href="/quiz-pages"><ArrowLeft /></Link></Button>
            <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-xl font-black">{form.internal_name || 'New quiz page'}</h1><Badge variant="outline" className="capitalize">{status}</Badge></div><p className="truncate font-mono text-xs text-slate-400">/en/football-quiz/{form.slug || 'your-slug'}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentSlug && <Button variant="outline" className="rounded-xl text-red-600" onClick={() => { setRetireAction(status === 'published' ? 'retire' : 'delete'); setRetireOpen(true); }}><Trash2 />{status === 'published' ? 'Unpublish' : 'Delete'}</Button>}
            {currentSlug && <Button variant="outline" className="rounded-xl" onClick={() => { setHistoryOpen(true); void refetchRevisions(); }} disabled={saving || action !== null}><History />History</Button>}
            {currentSlug && <Button variant="outline" className="rounded-xl" onClick={inspectGooglebot} disabled={saving || action !== null}><Code2 />{action === 'googlebot' ? 'Checking…' : 'Google check'}</Button>}
            <Button variant="outline" className="rounded-xl" onClick={preview} disabled={saving || action !== null}><Eye />{action === 'preview' ? 'Opening…' : 'Preview'}</Button>
            <Button variant="outline" className="rounded-xl" onClick={save} disabled={saving || action !== null}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{status === 'published' ? 'Save changes' : 'Save draft'}</Button>
            <Button className="rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700" onClick={() => setPublishOpen(true)} disabled={saving || action !== null}><Send />Publish</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1480px] gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-7">
          <Section icon={Settings2} eyebrow="Page setup" title="Basics" description="The CMS name, public URL and placement on the football quiz hub.">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Internal name" hint="Only visible in this CMS."><Input value={form.internal_name} onChange={(e) => updateInternalName(e.target.value)} placeholder="Arsenal Quiz" className="h-11 rounded-xl" /></Field>
              <Field label="Category" hint="Controls the group on the hub grid."><select value={form.category} onChange={(e) => patch('category', e.target.value as QuizPageInput['category'])} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium"><option value="team">Team</option><option value="league">League</option><option value="quiz_type">Quiz type</option><option value="article">Article</option></select></Field>
            </div>
            <Field label="Slug" hint="Lowercase letters, numbers and hyphens. A changed published slug automatically creates a permanent redirect.">
              <div className="flex h-11 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50"><span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400">/en/football-quiz/</span><input value={form.slug} onChange={(e) => updateSlug(e.target.value)} className="min-w-0 flex-1 px-3 font-mono text-sm outline-none" placeholder="arsenal" /></div>
            </Field>
          </Section>

          <Section icon={FileText} eyebrow="Page content" title="Hero and introduction" description="This content is server-rendered into the initial page response.">
            <Field label="H1"><Input value={form.h1} onChange={(e) => patch('h1', e.target.value)} className="h-11 rounded-xl" placeholder="Arsenal Quiz — Test Your Gunners Knowledge" /></Field>
            <Field label="Lede" hint="Use {count} where the verified question count belongs." counter={`${words(form.lede)} words · target 40–60`}><Textarea value={form.lede} onChange={(e) => patch('lede', e.target.value)} className="min-h-32 rounded-xl leading-6" /></Field>
          </Section>

          <Section icon={SearchCheck} eyebrow="Question bank" title="Quiz questions" description="Choose an existing campaign set or enter questions here. Both routes are permanently excluded from ranked matches.">
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setQuestionSource('existing')} className={`rounded-2xl border p-4 text-left transition ${form.question_source === 'existing' ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <Database className="mb-3 size-5 text-blue-600" />
                <p className="font-black">Use an existing set</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Select a verified public-only pool already in the database.</p>
              </button>
              <button type="button" onClick={() => setQuestionSource('manual')} className={`rounded-2xl border p-4 text-left transition ${form.question_source === 'manual' ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <ClipboardPaste className="mb-3 size-5 text-blue-600" />
                <p className="font-black">Enter questions manually</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Paste 1–15 multiple-choice questions using the format below.</p>
              </button>
            </div>

            {form.question_source === 'existing' ? (
              <>
                <Field label="Question set" hint="The verified count is derived automatically from this set.">
                  <select value={form.question_set_slug} onChange={(e) => patch('question_set_slug', e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold" disabled={setsLoading}>
                    <option value="">Choose a public-only set…</option>
                    {sets.filter((set) => set.public_only).map((set) => <option key={set.slug} value={set.slug}>{set.name} — {set.count} questions</option>)}
                  </select>
                </Field>
                {selectedSet && <div className="grid grid-cols-4 gap-3 rounded-2xl bg-slate-50 p-4 text-center">{[['Verified', selectedSet.count], ['Easy', selectedSet.easy], ['Medium', selectedSet.medium], ['Hard', selectedSet.hard]].map(([label, value]) => <div key={label}><p className="text-xl font-black">{value}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p></div>)}</div>}
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-blue-950">Required paste format</p>
                      <p className="mt-1 text-xs leading-5 text-blue-800">Use four answers, mark the correct letter, and separate questions with <span className="font-mono font-bold">---</span>. Explanation is optional.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-lg border-blue-200 bg-white text-blue-700" onClick={() => setManualQuestionText((current) => current.trim() ? `${current.trim()}\n---\n${MANUAL_QUESTION_EXAMPLE}` : MANUAL_QUESTION_EXAMPLE)}><Plus />Insert example</Button>
                  </div>
                  <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-200">{MANUAL_QUESTION_EXAMPLE}</pre>
                </div>
                <Field label="Questions and answers" hint="You can save fewer than 10 as a draft; publishing requires at least 10." counter={`${manualParse.questions.length}/15 parsed`}>
                  <Textarea value={manualQuestionText} onChange={(event) => setManualQuestionText(event.target.value)} placeholder={MANUAL_QUESTION_EXAMPLE} spellCheck className={`min-h-[440px] rounded-2xl bg-slate-950 p-5 font-mono text-sm leading-6 text-slate-100 placeholder:text-slate-600 ${manualParse.errors.length > 0 ? 'border-red-400 ring-4 ring-red-50' : ''}`} />
                </Field>
                <div className="grid grid-cols-4 gap-3 rounded-2xl bg-slate-50 p-4 text-center">{[['Verified', manualParse.questions.length], ['Easy', manualDifficulty.easy], ['Medium', manualDifficulty.medium], ['Hard', manualDifficulty.hard]].map(([label, value]) => <div key={label}><p className="text-xl font-black">{value}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p></div>)}</div>
                {manualParse.errors.length > 0 ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="mb-2 text-xs font-black uppercase tracking-wider text-red-700">Fix before saving</p><ul className="space-y-1 text-xs font-semibold leading-5 text-red-700">{manualParse.errors.slice(0, 6).map((error) => <li key={error}>• {error}</li>)}</ul></div> : manualParse.questions.length > 0 ? <p className="flex items-center gap-2 text-xs font-bold text-emerald-700"><Check className="size-4" />Format valid. These questions will be public-only and unavailable in ranked games.</p> : null}
              </div>
            )}
          </Section>

          <Section icon={FileText} eyebrow="Editorial" title="About this quiz" description="Add paragraphs or bullet points in the order they should appear.">
            <Field label="H2 heading"><Input value={form.about_heading} onChange={(e) => patch('about_heading', e.target.value)} className="h-11 rounded-xl" /></Field>
            <div className="space-y-3">
              {form.about_blocks.map((block, index) => (
                <div key={block.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between"><select value={block.type} onChange={(e) => updateBlock(index, { type: e.target.value as QuizAboutBlock['type'] })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold"><option value="paragraph">Paragraph</option><option value="bullet">Bullet</option></select><button type="button" aria-label={`Remove content block ${index + 1}`} onClick={() => removeBlock(index)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="size-4" /></button></div>
                  <Textarea value={block.text} onChange={(e) => updateBlock(index, { text: e.target.value })} className="min-h-28 rounded-xl bg-white leading-6" />
                </div>
              ))}
              <Button type="button" variant="outline" className="w-full rounded-xl border-dashed" onClick={addBlock}><Plus />Add content block</Button>
            </div>
          </Section>

          <Section icon={Link2} eyebrow="Conversion" title="Calls to action" description="Use {score} in the score-screen message to insert the player’s result.">
            <Field label="Score-screen CTA"><Textarea value={form.score_cta} onChange={(e) => patch('score_cta', e.target.value)} className="min-h-24 rounded-xl" /></Field>
            <Field label="Footer banner"><Textarea value={form.footer_banner_text} onChange={(e) => patch('footer_banner_text', e.target.value)} className="min-h-24 rounded-xl" /></Field>
            <Field label="Footer button label"><Input value={form.footer_button_label} onChange={(e) => patch('footer_button_label', e.target.value)} className="h-11 rounded-xl" /></Field>
          </Section>

          <Section icon={Link2} eyebrow="Internal links" title="Related quizzes" description="Choose 3–6 published pages. The football quiz hub is appended automatically.">
            <div className="space-y-2">{form.related_slugs.map((slug, index) => { const page = allPages.find((item) => item.slug === slug); return <div key={slug} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="grid size-7 place-items-center rounded-lg bg-white text-xs font-black text-slate-400">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{page?.internal_name ?? slug}</span><Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${page?.internal_name ?? slug} up`} disabled={index === 0} onClick={() => moveRelated(index, -1)}><ArrowUp /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${page?.internal_name ?? slug} down`} disabled={index === form.related_slugs.length - 1} onClick={() => moveRelated(index, 1)}><ArrowDown /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${page?.internal_name ?? slug}`} onClick={() => patch('related_slugs', form.related_slugs.filter((item) => item !== slug))}><X /></Button></div>; })}</div>
            {form.related_slugs.length < 6 && <select value="" onChange={(e) => e.target.value && patch('related_slugs', [...form.related_slugs, e.target.value])} className="h-11 w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 text-sm font-bold text-slate-500"><option value="">+ Add a published quiz…</option>{relatedOptions.map((page) => <option key={page.slug} value={page.slug}>{page.internal_name}</option>)}</select>}
            {form.related_slugs.length < 3 && <p className="flex items-center gap-2 text-xs font-semibold text-amber-700"><AlertTriangle className="size-4" />Add at least {3 - form.related_slugs.length} more related quiz{3 - form.related_slugs.length === 1 ? '' : 'zes'} before publishing.</p>}
          </Section>

          <Section icon={Languages} eyebrow="Localisation" title="Language variant" description="English-only pages emit only an English alternate; bilingual pages emit the en/ka pair.">
            <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => patch('locale_mode', 'en_only')} className={`rounded-2xl border p-4 text-left ${form.locale_mode === 'en_only' ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-50' : 'border-slate-200'}`}><p className="font-black">English only</p><p className="mt-1 text-xs text-slate-500">No Georgian URL is published.</p></button><button type="button" onClick={() => patch('locale_mode', 'en_ka')} className={`rounded-2xl border p-4 text-left ${form.locale_mode === 'en_ka' ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-50' : 'border-slate-200'}`}><p className="font-black">English + Georgian</p><p className="mt-1 text-xs text-slate-500">Emit matching hreflang pages.</p></button></div>
            {form.locale_mode === 'en_ka' && <div className="space-y-5 rounded-2xl bg-slate-50 p-5"><Field label="Georgian title tag" counter={`${renderedKaSeoTitle.length}/60 rendered`}><Input value={form.ka_seo_title ?? ''} onChange={(e) => patch('ka_seo_title', e.target.value)} className={`h-11 rounded-xl bg-white ${renderedKaSeoTitle.length > 60 ? 'border-amber-400' : ''}`} /></Field><Field label="Georgian meta description" counter={`${renderedKaMetaDescription.length}/155 rendered`}><Textarea value={form.ka_meta_description ?? ''} onChange={(e) => patch('ka_meta_description', e.target.value)} className={`rounded-xl bg-white ${renderedKaMetaDescription.length > 155 ? 'border-amber-400' : ''}`} /></Field><Field label="Georgian H1"><Input value={form.ka_h1 ?? ''} onChange={(e) => patch('ka_h1', e.target.value)} className="h-11 rounded-xl bg-white" /></Field><Field label="Georgian lede"><Textarea value={form.ka_lede ?? ''} onChange={(e) => patch('ka_lede', e.target.value)} className="min-h-28 rounded-xl bg-white" /></Field></div>}
          </Section>
        </main>

        <aside className="space-y-7 xl:self-start">
          <Section icon={ImagePlus} eyebrow="Media" title="Artwork" description="Optimised to WebP and served from QuizBall storage.">
            <ImageUploader label="Hero/category artwork" value={form.hero_image_url} alt={form.hero_image_alt} kind="hero" slug={form.slug} onUploaded={(url) => patch('hero_image_url', url)} onAltChange={(alt) => patch('hero_image_alt', alt)} />
            <ImageUploader label="OG image override (optional)" value={form.og_image_url} alt={form.og_image_alt ?? ''} kind="og" slug={form.slug} onUploaded={(url) => patch('og_image_url', url)} onAltChange={(alt) => patch('og_image_alt', alt)} />
          </Section>

          <Section icon={Globe2} eyebrow="Search appearance" title="SEO metadata" description="Canonical, hreflang and structured data are generated automatically.">
            <Field label="Title tag" counter={`${renderedSeoTitle.length}/60 rendered`}><Input value={form.seo_title} onChange={(e) => patch('seo_title', e.target.value)} className={`h-11 rounded-xl ${renderedSeoTitle.length > 60 ? 'border-amber-400' : ''}`} /></Field>
            <Field label="Meta description" hint="Use {count} for the attached set size." counter={`${renderedMetaDescription.length}/155 rendered`}><Textarea value={form.meta_description} onChange={(e) => patch('meta_description', e.target.value)} className={`min-h-28 rounded-xl ${renderedMetaDescription.length > 155 ? 'border-amber-400' : ''}`} /></Field>
            <Field label="Breadcrumb label"><Input value={form.breadcrumb_label} onChange={(e) => patch('breadcrumb_label', e.target.value)} className="h-11 rounded-xl" /></Field>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Generated automatically</p>{['Production canonical', 'en/ka hreflang', 'WebPage + BreadcrumbList', 'Game structured data', 'XML sitemap entry'].map((item) => <p key={item} className="flex items-center gap-2 py-1 text-xs font-semibold text-slate-600"><Check className="size-3.5 text-emerald-600" />{item}</p>)}</div>
          </Section>

          {savedPage?.warnings?.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="mb-3 flex items-center gap-2 text-sm font-black text-amber-900"><AlertTriangle className="size-4" />Checks to review</p><ul className="space-y-2 text-xs font-semibold leading-5 text-amber-800">{savedPage.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div> : null}
        </aside>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-2xl font-black">Publish quiz page</DialogTitle><DialogDescription>Publish immediately or choose an optional future date. The page will enter the hub and sitemap automatically.</DialogDescription></DialogHeader>
          <div className="space-y-2 py-4"><Label className="font-bold">Scheduled date (optional)</Label><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-11 rounded-xl" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button><Button onClick={publish} disabled={action === 'publish'} className="bg-blue-600 text-white hover:bg-blue-700">{action === 'publish' ? <Loader2 className="animate-spin" /> : scheduledAt ? <CalendarClock /> : <Send />}{scheduledAt ? 'Schedule' : 'Publish now'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retireOpen} onOpenChange={setRetireOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-2xl font-black">{retireAction === 'delete' ? 'Delete quiz page' : 'Unpublish quiz page'}</DialogTitle><DialogDescription>Choose what visitors and search engines should receive at the old URL.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-4"><label className={`block cursor-pointer rounded-2xl border p-4 ${routeMode === 'gone' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="route-mode" className="mr-3" checked={routeMode === 'gone'} onChange={() => setRouteMode('gone')} /><span className="font-bold">410 Gone</span><p className="ml-6 mt-1 text-xs text-slate-500">Tell search engines this page was intentionally removed.</p></label><label className={`block cursor-pointer rounded-2xl border p-4 ${routeMode === 'redirect' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="route-mode" className="mr-3" checked={routeMode === 'redirect'} onChange={() => setRouteMode('redirect')} /><span className="font-bold">301 redirect</span><p className="ml-6 mt-1 text-xs text-slate-500">Send visitors permanently to another published quiz.</p></label>{routeMode === 'redirect' && <select value={targetSlug} onChange={(e) => setTargetSlug(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"><option value="">Choose destination…</option>{allPages.filter((page) => page.status === 'published' && page.slug !== currentSlug).map((page) => <option key={page.slug} value={page.slug}>{page.internal_name}</option>)}</select>}</div>
          <DialogFooter><Button variant="outline" onClick={() => setRetireOpen(false)}>Cancel</Button><Button variant="destructive" onClick={retire} disabled={action === retireAction}>{action === retireAction && <Loader2 className="animate-spin" />}{retireAction === 'delete' ? 'Delete page' : 'Unpublish page'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[86vh] overflow-hidden rounded-3xl p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle className="flex items-center gap-2 text-2xl font-black"><History className="size-5 text-blue-600" />Revision history</DialogTitle>
            <DialogDescription>Every save, preview and publish is retained. Restoring a version also keeps the current version in this timeline.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-2 overflow-y-auto px-6 py-4">
            {revisions.length === 0 ? (
              <div className="py-12 text-center text-sm font-semibold text-slate-400">No saved revisions yet.</div>
            ) : revisions.map((revision) => (
              <div key={revision.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-black text-blue-600">{revision.revision_number}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-extrabold">{revision.summary.h1 || revision.summary.internal_name}</p><Badge variant="outline" className="capitalize">{revision.action}</Badge></div>
                  <p className="mt-1 text-xs text-slate-400">{new Date(revision.created_at).toLocaleString('en-GB')} · {revision.editor_name || 'Admin'} · {revision.summary.question_count} questions</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl" disabled={action === 'restore'} onClick={() => restore(revision.id, revision.revision_number)}><Undo2 />Restore</Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={googlebotOpen} onOpenChange={setGooglebotOpen}>
        <DialogContent className="max-h-[92vh] overflow-hidden rounded-3xl p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle className="flex items-center gap-2 text-2xl font-black"><SearchCheck className="size-5 text-blue-600" />View as Googlebot</DialogTitle>
            <DialogDescription>This fetches the real preview with Googlebot’s user agent and checks the raw server HTML before JavaScript runs.</DialogDescription>
          </DialogHeader>
          {action === 'googlebot' && !googlebotResult ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-slate-500"><Loader2 className="mb-3 size-7 animate-spin text-blue-600" /><p className="text-sm font-bold">Fetching server-rendered HTML…</p></div>
          ) : googlebotResult ? (
            <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="max-h-[70vh] overflow-y-auto border-r border-slate-100 p-5">
                <div className={`mb-4 rounded-2xl p-4 ${googlebotResult.status_code === 200 ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}><p className="text-xs font-black uppercase tracking-wider">HTTP response</p><p className="mt-1 text-2xl font-black">{googlebotResult.status_code}</p></div>
                <div className="space-y-2">{googlebotResult.checks.map((check) => <div key={check.key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">{check.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}<div><p className="text-xs font-extrabold text-slate-800">{check.label}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-400">{check.detail}</p></div></div>)}</div>
              </div>
              <div className="min-h-0 bg-slate-950 p-5"><div className="mb-3 flex items-center justify-between gap-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Raw initial HTML</p><a href={googlebotResult.url} target="_blank" rel="noreferrer" className="truncate text-xs font-bold text-blue-400 hover:underline">Open fetched URL</a></div><pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-slate-300">{googlebotResult.html}</pre></div>
            </div>
          ) : (
            <div className="min-h-80 p-8 text-center text-sm font-semibold text-slate-400">The inspection could not be completed.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
