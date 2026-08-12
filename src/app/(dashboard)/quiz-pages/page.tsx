'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileText,
  Globe2,
  ImageIcon,
  ListOrdered,
  Pin,
  Plus,
  Search,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useQuizPages,
  useQuizPageSearchConsole,
  useUpdateQuizHubOrder,
} from '@/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { QuizPageCategory, QuizPageListItem, QuizPageStatus } from '@/types';

const statusStyle: Record<QuizPageStatus, string> = {
  draft: 'border-slate-200 bg-slate-100 text-slate-600',
  preview: 'border-amber-200 bg-amber-50 text-amber-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  archived: 'border-gray-200 bg-gray-100 text-gray-500',
};

const categoryLabel: Record<QuizPageCategory, string> = {
  team: 'Teams',
  league: 'Leagues',
  quiz_type: 'Quiz types',
  article: 'Articles',
};

const categoryOrder: QuizPageCategory[] = ['team', 'league', 'quiz_type', 'article'];

function HubOrderDialog({
  open,
  onOpenChange,
  pages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: QuizPageListItem[];
}) {
  const [ordered, setOrdered] = useState<QuizPageListItem[]>(() => (
    [...pages].sort((left, right) => (
      categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category)
      || Number(right.is_hub_pinned) - Number(left.is_hub_pinned)
      || left.hub_order - right.hub_order
      || left.internal_name.localeCompare(right.internal_name)
    ))
  ));
  const updateOrder = useUpdateQuizHubOrder();

  const move = (slug: string, direction: -1 | 1) => {
    setOrdered((current) => {
      const index = current.findIndex((page) => page.slug === slug);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      if (current[index].category !== current[target].category) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const togglePin = (slug: string) => {
    setOrdered((current) => current.map((page) => (
      page.slug === slug ? { ...page, is_hub_pinned: !page.is_hub_pinned } : page
    )));
  };

  const save = async () => {
    const positions = new Map<QuizPageCategory, number>();
    await updateOrder.mutateAsync({
      items: ordered.map((page) => {
        const position = (positions.get(page.category) ?? 0) + 1;
        positions.set(page.category, position);
        return { slug: page.slug, hub_order: position, is_pinned: page.is_hub_pinned };
      }),
    });
    toast.success('Football quiz hub order saved');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <ListOrdered className="size-5 text-blue-600" /> Arrange the quiz hub
          </DialogTitle>
          <DialogDescription>
            Pinned cards appear first. Arrow controls set the order inside each category.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] overflow-y-auto px-6 py-4">
          {categoryOrder.map((category) => {
            const categoryPages = ordered.filter((page) => page.category === category);
            if (categoryPages.length === 0) return null;
            return (
              <section key={category} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  {categoryLabel[category]}
                </h3>
                <div className="space-y-2">
                  {categoryPages.map((page, index) => (
                    <div key={page.slug} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100">
                        {page.hero_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={page.hero_image_url} alt="" className="size-full object-cover" />
                        ) : <ImageIcon className="size-4 text-slate-300" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold text-slate-900">{page.internal_name}</p>
                        <p className="truncate font-mono text-[11px] text-slate-400">/{page.slug}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePin(page.slug)}
                        className={`grid size-9 place-items-center rounded-xl border transition ${page.is_hub_pinned ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400 hover:text-slate-700'}`}
                        aria-label={page.is_hub_pinned ? `Unpin ${page.internal_name}` : `Pin ${page.internal_name}`}
                      >
                        <Pin className={`size-4 ${page.is_hub_pinned ? 'fill-current' : ''}`} />
                      </button>
                      <button type="button" onClick={() => move(page.slug, -1)} disabled={index === 0} className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-25" aria-label={`Move ${page.internal_name} up`}>
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" onClick={() => move(page.slug, 1)} disabled={index === categoryPages.length - 1} className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-25" aria-label={`Move ${page.internal_name} down`}>
                        <ArrowDown className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <DialogFooter className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={updateOrder.isPending} className="bg-blue-600 text-white hover:bg-blue-700">
            {updateOrder.isPending ? 'Saving…' : 'Save hub order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function QuizPagesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QuizPageStatus | 'all'>('all');
  const [arranging, setArranging] = useState(false);
  const { data = [], isLoading, error } = useQuizPages();
  const searchConsole = useQuizPageSearchConsole();

  const pages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.filter((page) => (
      (status === 'all' || page.status === status)
      && (!query || page.internal_name.toLowerCase().includes(query) || page.slug.includes(query))
    ));
  }, [data, search, status]);

  const metricsBySlug = useMemo(() => new Map(
    (searchConsole.data?.pages ?? []).map((metric) => [metric.slug, metric]),
  ), [searchConsole.data]);
  const publishedPages = data.filter((page) => page.status === 'published');
  const published = publishedPages.length;
  const scheduled = data.filter((page) => page.scheduled_publish_at && new Date(page.scheduled_publish_at) > new Date()).length;

  return (
    <div className="min-h-screen bg-[#f8f9fb] px-2 py-8 text-slate-950">
      <div className="mx-auto max-w-[1420px] space-y-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
              <Globe2 className="size-4" /> SEO landing pages
            </div>
            <h1 className="text-4xl font-black tracking-[-0.04em]">Quiz Pages</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
              Create, preview and publish football quiz landing pages without a deployment.
              Published pages are added to the hub and sitemap automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setArranging(true)} className="h-11 rounded-xl px-5 font-bold">
              <ListOrdered className="size-4" /> Arrange hub
            </Button>
            <Button asChild className="h-11 rounded-xl bg-slate-950 px-5 font-bold text-white shadow-lg shadow-slate-200">
              <Link href="/quiz-pages/new"><Plus className="size-4" /> New quiz page</Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'All pages', value: data.length, icon: FileText },
            { label: 'Published', value: published, icon: CheckCircle2 },
            { label: 'Scheduled', value: scheduled, icon: CalendarClock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="size-5" /></div>
              <div><p className="text-2xl font-black tracking-tight">{value}</p><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p></div>
            </div>
          ))}
        </section>

        {searchConsole.data && !searchConsole.data.configured && (
          <section className="flex items-start gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-950">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600"><Unplug className="size-5" /></div>
            <div>
              <h2 className="font-extrabold">Google Search Console is not connected here</h2>
              <p className="mt-1 text-sm leading-6 text-blue-800/75">
                Add the read-only Search Console service account settings to this environment to show real clicks, impressions, CTR and average position. No placeholder analytics are shown.
              </p>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or slug…" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'draft', 'preview', 'published'] as const).map((value) => (
                <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize transition ${status === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="p-14 text-center text-sm font-medium text-slate-400">Loading quiz pages…</div>
          ) : error ? (
            <div className="p-14 text-center text-sm font-medium text-red-600">Quiz pages could not be loaded.</div>
          ) : pages.length === 0 ? (
            <div className="p-16 text-center">
              <FileText className="mx-auto mb-4 size-9 text-slate-300" />
              <p className="font-bold text-slate-700">No quiz pages match this view.</p>
              <p className="mt-1 text-sm text-slate-400">Create a page or change your filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pages.map((page) => {
                const metric = metricsBySlug.get(page.slug);
                return (
                  <Link key={page.slug} href={`/quiz-pages/${page.slug}`} className="group grid gap-4 p-5 transition hover:bg-slate-50/80 md:grid-cols-[72px_1fr_auto_auto] md:items-center">
                    <div className="grid size-[72px] place-items-center overflow-hidden rounded-2xl bg-slate-100">
                      {page.hero_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={page.hero_image_url} alt="" className="size-full object-cover" />
                      ) : <ImageIcon className="size-6 text-slate-300" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-extrabold text-slate-900">{page.internal_name}</h2>
                        <Badge variant="outline" className={statusStyle[page.status]}>{page.status}</Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">{categoryLabel[page.category].replace(/s$/, '')}</Badge>
                        {page.is_hub_pinned && <Pin className="size-3.5 fill-blue-600 text-blue-600" aria-label="Pinned on hub" />}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-slate-400">/en/football-quiz/{page.slug}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">{page.question_count} verified questions · Updated {new Date(page.updated_at).toLocaleDateString('en-GB')}</p>
                    </div>
                    {searchConsole.data?.configured && page.status === 'published' && (
                      <div className="min-w-64 rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400"><BarChart3 className="size-3.5" /> Google · 28 days</p>
                        <div className="mt-2 grid grid-cols-4 gap-4">
                          <div><p className="text-base font-black text-slate-900">{metric?.clicks ?? 0}</p><p className="text-[10px] font-bold uppercase text-slate-400">Clicks</p></div>
                          <div><p className="text-base font-black text-slate-900">{metric?.impressions ?? 0}</p><p className="text-[10px] font-bold uppercase text-slate-400">Impressions</p></div>
                          <div><p className="text-base font-black text-slate-900">{((metric?.ctr ?? 0) * 100).toFixed(1)}%</p><p className="text-[10px] font-bold uppercase text-slate-400">CTR</p></div>
                          <div><p className="text-base font-black text-slate-900">{metric?.position?.toFixed(1) ?? '—'}</p><p className="text-[10px] font-bold uppercase text-slate-400">Position</p></div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm font-bold text-slate-400 group-hover:text-blue-600">
                      Edit <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {arranging && <HubOrderDialog open onOpenChange={setArranging} pages={publishedPages} />}
    </div>
  );
}
