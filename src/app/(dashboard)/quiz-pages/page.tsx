'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileText,
  Globe2,
  GripVertical,
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

function HubCard({
  page,
  onTogglePin,
}: {
  page: QuizPageListItem;
  onTogglePin: (slug: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: page.slug,
    data: { category: page.category },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-2xl border bg-white p-3 transition-shadow ${
        isDragging
          ? 'border-blue-300 opacity-40 shadow-lg'
          : 'border-slate-200 hover:border-blue-200 hover:shadow-sm'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="grid size-9 shrink-0 touch-none cursor-grab place-items-center rounded-xl text-slate-300 transition hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 active:cursor-grabbing"
        aria-label={`Drag ${page.internal_name} to reorder`}
      >
        <GripVertical className="size-5" />
      </button>
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
        onClick={() => onTogglePin(page.slug)}
        className={`grid size-9 place-items-center rounded-xl border transition ${page.is_hub_pinned ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400 hover:text-slate-700'}`}
        aria-label={page.is_hub_pinned ? `Unpin ${page.internal_name}` : `Pin ${page.internal_name}`}
      >
        <Pin className={`size-4 ${page.is_hub_pinned ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}

function HubCardOverlay({ page }: { page: QuizPageListItem }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-white p-3 shadow-2xl shadow-blue-950/15">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
        <GripVertical className="size-5" />
      </div>
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
      {page.is_hub_pinned && (
        <button
          type="button"
          className="grid size-9 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600"
          aria-label={`${page.internal_name} is pinned`}
          disabled
        >
          <Pin className="size-4 fill-current" />
        </button>
      )}
    </div>
  );
}

function HubOrderDialog({
  open,
  onOpenChange,
  pages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: QuizPageListItem[];
}) {
  const sortedPages = useMemo(() => (
    [...pages].sort((left, right) => (
      categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category)
      || Number(right.is_hub_pinned) - Number(left.is_hub_pinned)
      || left.hub_order - right.hub_order
      || left.internal_name.localeCompare(right.internal_name)
    ))
  ), [pages]);
  const [ordered, setOrdered] = useState<QuizPageListItem[]>(sortedPages);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const updateOrder = useUpdateQuizHubOrder();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = ({ active }: DragStartEvent) => setActiveSlug(String(active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveSlug(null);
    if (!over || active.id === over.id) return;
    if (active.data.current?.category !== over.data.current?.category) {
      toast.error('Cards can only be reordered inside their own category.');
      return;
    }

    setOrdered((current) => {
      const from = current.findIndex((page) => page.slug === active.id);
      const to = current.findIndex((page) => page.slug === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  const togglePin = (slug: string) => {
    setOrdered((current) => current.map((page) => (
      page.slug === slug ? { ...page, is_hub_pinned: !page.is_hub_pinned } : page
    )));
  };

  const save = async () => {
    const positions = new Map<QuizPageCategory, number>();
    try {
      await updateOrder.mutateAsync({
        items: ordered.map((page) => {
          const position = (positions.get(page.category) ?? 0) + 1;
          positions.set(page.category, position);
          return { slug: page.slug, hub_order: position, is_pinned: page.is_hub_pinned };
        }),
      });
      toast.success('Football quiz hub order saved');
      onOpenChange(false);
    } catch {
      toast.error('The hub order could not be saved.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-slate-100 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <ListOrdered className="size-5 text-blue-600" /> Arrange the quiz hub
          </DialogTitle>
          <DialogDescription>
            Drag cards by the handle to set their order. Pinned cards appear first on the public hub.
          </DialogDescription>
        </DialogHeader>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveSlug(null)}
        >
          <div className="max-h-[62vh] overflow-y-auto px-6 py-4">
            {categoryOrder.map((category) => {
              const categoryPages = ordered.filter((page) => page.category === category);
              if (categoryPages.length === 0) return null;
              return (
                <section key={category} className="mb-6 last:mb-0">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    {categoryLabel[category]}
                  </h3>
                  <SortableContext items={categoryPages.map((page) => page.slug)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {categoryPages.map((page) => (
                        <HubCard key={page.slug} page={page} onTogglePin={togglePin} />
                      ))}
                    </div>
                  </SortableContext>
                </section>
              );
            })}
          </div>
          <DragOverlay>
            {activeSlug ? (
              <div className="w-[min(680px,calc(100vw-4rem))]">
                {ordered.find((page) => page.slug === activeSlug) ? (
                  <HubCardOverlay page={ordered.find((page) => page.slug === activeSlug)!} />
                ) : null}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
  const [view, setView] = useState<'pages' | 'hub' | 'search'>('pages');
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
    <div className="min-h-screen bg-[#f8f9fb] px-2 pb-8 text-slate-950">
      <div className="-mx-8 mb-8 border-b border-slate-200 bg-white px-8">
        <div className="mx-auto flex max-w-[1420px] gap-1 overflow-x-auto">
          {([
            ['pages', 'Pages'],
            ['hub', 'Hub layout'],
            ['search', 'Search performance'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={`relative h-14 shrink-0 px-4 text-sm font-bold transition ${view === id ? 'text-blue-700' : 'text-slate-400 hover:text-slate-700'}`}>
              {label}
              {view === id && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-blue-600" />}
            </button>
          ))}
        </div>
      </div>
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
            <Button asChild className="h-11 rounded-xl bg-slate-950 px-5 font-bold text-white shadow-lg shadow-slate-200">
              <Link href="/quiz-pages/new"><Plus className="size-4" /> New quiz page</Link>
            </Button>
          </div>
        </header>

        {view === 'pages' && <section className="grid gap-3 sm:grid-cols-3">
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
        </section>}

        {view === 'search' && searchConsole.data && !searchConsole.data.configured && (
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

        {view === 'hub' && (
          <section className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-600"><ListOrdered className="size-4" /> Football quiz hub</div><h2 className="text-2xl font-black">Card order and featured quizzes</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Pin important quizzes and arrange cards within Teams, Leagues, Quiz types and Articles.</p></div>
              <Button onClick={() => setArranging(true)} className="h-11 rounded-xl bg-blue-600 px-5 text-white hover:bg-blue-700"><ListOrdered className="size-4" />Arrange hub</Button>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{categoryOrder.map((category) => <div key={category} className="rounded-2xl bg-slate-50 p-5"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{categoryLabel[category]}</p><p className="mt-2 text-3xl font-black text-slate-900">{publishedPages.filter((page) => page.category === category).length}</p><p className="mt-1 text-xs text-slate-500">published cards</p></div>)}</div>
          </section>
        )}

        {view === 'search' && searchConsole.data?.configured && (
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-600"><BarChart3 className="size-4" /> Google Search Console</div><h2 className="mt-2 text-2xl font-black">Search performance</h2><p className="mt-1 text-sm text-slate-500">Clicks, impressions, CTR and average position for the latest complete 28-day period.</p></div>
            <div className="divide-y divide-slate-100">{publishedPages.map((page) => { const metric = metricsBySlug.get(page.slug); return <div key={page.slug} className="grid gap-4 p-5 sm:grid-cols-[1fr_repeat(4,minmax(80px,120px))] sm:items-center"><div><p className="font-extrabold">{page.internal_name}</p><p className="mt-1 font-mono text-xs text-slate-400">/{page.slug}</p></div><div><p className="text-lg font-black">{metric?.clicks ?? 0}</p><p className="text-[10px] font-bold uppercase text-slate-400">Clicks</p></div><div><p className="text-lg font-black">{metric?.impressions ?? 0}</p><p className="text-[10px] font-bold uppercase text-slate-400">Impressions</p></div><div><p className="text-lg font-black">{((metric?.ctr ?? 0) * 100).toFixed(1)}%</p><p className="text-[10px] font-bold uppercase text-slate-400">CTR</p></div><div><p className="text-lg font-black">{metric?.position?.toFixed(1) ?? '—'}</p><p className="text-[10px] font-bold uppercase text-slate-400">Position</p></div></div>; })}</div>
          </section>
        )}

        {view === 'pages' && <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
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
        </section>}
      </div>
      {arranging && (
        <HubOrderDialog
          key={publishedPages.map((page) => `${page.slug}:${page.hub_order}:${page.is_hub_pinned}`).join('|')}
          open
          onOpenChange={setArranging}
          pages={publishedPages}
        />
      )}
    </div>
  );
}
