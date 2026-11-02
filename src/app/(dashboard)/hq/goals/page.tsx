'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hqKeys, useHqGoals, useHqPastGoals } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HqGoal, HqGoalHorizon } from '@/types';
import { AddGoalCard, GoalCard, GoalDialog, HORIZON_LABELS, NorthStarCard } from '../goal-ui';
import { LoadErrorState, PageHeader, RefreshErrorBanner } from '../hq-ui';

const SECTIONS: Array<{ horizon: Exclude<HqGoalHorizon, 'north_star'>; emoji: string; hint: string }> = [
  { horizon: 'week', emoji: '📅', hint: 'What has to be true by Sunday.' },
  { horizon: 'day', emoji: '☀️', hint: 'Today’s focus — small, concrete, done by tonight.' },
];

export default function GoalsPage() {
  const { data: goals, isLoading, error, refetch } = useHqGoals();
  const [now] = useState(() => new Date());
  const [dialog, setDialog] = useState<{ goal: HqGoal | null; horizon: HqGoalHorizon } | null>(null);
  const [showPast, setShowPast] = useState(false);
  // Past goals are fetched only when the section is opened, a page at a time.
  const pastQuery = useHqPastGoals(showPast);
  const queryClient = useQueryClient();
  const past = pastQuery.data?.pages.flatMap((p) => p.items) ?? [];

  const active = (goals ?? []).filter((g) => g.status === 'active').sort((a, b) => a.position - b.position);
  const northStar = active.find((g) => g.horizon === 'north_star') ?? null;
  const edit = (goal: HqGoal) => setDialog({ goal, horizon: goal.horizon });

  return (
    <div className="mx-auto max-w-7xl space-y-12 pb-16">
      <PageHeader
        icon="🎯"
        title={<span className="text-4xl">Goals</span>}
        description="Where the company is going. Agents read these every morning and suggest ideas that move them."
        actions={
          <Button size="lg" className="rounded-full" onClick={() => setDialog({ goal: null, horizon: 'week' })}>
            <Plus className="h-5 w-5" /> New goal
          </Button>
        }
      />

      {isLoading && !goals ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading goals…
        </div>
      ) : !goals ? (
        <LoadErrorState error={error} fallback="Could not load goals." onRetry={() => void refetch()} />
      ) : (
        <>
          {error && <RefreshErrorBanner />}
          <NorthStarCard goal={northStar} onEdit={edit} onCreate={() => setDialog({ goal: null, horizon: 'north_star' })} now={now} />

          {SECTIONS.map(({ horizon, emoji, hint }) => {
            const list = active.filter((g) => g.horizon === horizon);
            return (
              <section key={horizon}>
                <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
                  {emoji} {HORIZON_LABELS[horizon]}
                </h2>
                <p className="mb-5 mt-1 text-lg text-slate-500">{hint}</p>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((g) => (
                    <GoalCard key={g.id} goal={g} onEdit={edit} now={now} />
                  ))}
                  <AddGoalCard label={list.length === 0 ? `Set ${horizon === 'week' ? 'this week’s' : 'today’s'} goal` : 'Add another'} onClick={() => setDialog({ goal: null, horizon })} />
                </div>
              </section>
            );
          })}

          <section>
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              aria-expanded={showPast}
              className="flex items-center gap-2 text-xl font-bold text-slate-600 hover:text-slate-900"
            >
              <ChevronDown className={cn('h-5 w-5 transition', showPast && 'rotate-180')} />
              Past goals
              {showPast && pastQuery.data && (
                <span className="text-base font-medium text-slate-400">
                  ({past.length}
                  {pastQuery.hasNextPage ? '+' : ''})
                </span>
              )}
            </button>
            {showPast &&
              (!pastQuery.data ? (
                pastQuery.isLoading ? (
                  <div className="mt-4 flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading past goals…
                  </div>
                ) : (
                  <div className="mt-4">
                    <LoadErrorState error={pastQuery.error} fallback="Could not load past goals." onRetry={() => void pastQuery.refetch()} />
                  </div>
                )
              ) : (
                <>
                  {pastQuery.isError && (
                    // Cached pages stay visible; a failed "Load more" (e.g. the
                    // cursor goal was deleted) must still be visible and
                    // recoverable — restart paging from the newest page.
                    <div className="mt-4">
                      <LoadErrorState
                        error={pastQuery.error}
                        fallback="Could not load more past goals."
                        onRetry={() => void queryClient.resetQueries({ queryKey: hqKeys.pastGoals() })}
                      />
                    </div>
                  )}
                  {past.length === 0 ? (
                    <p className="mt-3 text-slate-400">Achieved and dropped goals will collect here.</p>
                  ) : (
                    <div className="mt-5 grid gap-5 opacity-80 sm:grid-cols-2 xl:grid-cols-3">
                      {past.map((g) => (
                        <GoalCard key={g.id} goal={g} onEdit={edit} now={now} />
                      ))}
                    </div>
                  )}
                  {pastQuery.hasNextPage && past.length > 0 && (
                    <div className="mt-6 flex justify-center">
                      <Button variant="outline" onClick={() => void pastQuery.fetchNextPage({ cancelRefetch: false })} disabled={pastQuery.isFetching}>
                        {pastQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                        Load more
                      </Button>
                    </div>
                  )}
                </>
              ))}
          </section>
        </>
      )}

      <GoalDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} goal={dialog?.goal} defaultHorizon={dialog?.horizon} />
    </div>
  );
}
