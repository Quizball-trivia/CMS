'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hqKeys, useHqClock, useHqGoals, useHqPastGoals } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HqGoal, HqGoalHorizon } from '@/types';
import { AddGoalRow, GoalDialog, GoalRow, HORIZON_LABELS, NorthStarCard, isGoalEnded } from '../goal-ui';
import { HQ_LABEL, HQ_PAGE, LoadErrorState, PageHeader, Panel, RefreshErrorBanner, Section } from '../hq-ui';

const SECTIONS: Array<{ horizon: Exclude<HqGoalHorizon, 'north_star'>; hint: string }> = [
  { horizon: 'week', hint: 'What has to be true by Sunday.' },
  { horizon: 'day', hint: 'Today’s focus: small, concrete, done by tonight.' },
];

export default function GoalsPage() {
  const { data: goals, isLoading, error, refetch } = useHqGoals();
  const now = useHqClock();
  const [dialog, setDialog] = useState<{ goal: HqGoal | null; horizon: HqGoalHorizon } | null>(null);
  const [showPast, setShowPast] = useState(false);
  // Past goals are fetched only when the section is opened, a page at a time.
  const pastQuery = useHqPastGoals(showPast);
  const queryClient = useQueryClient();
  const past = pastQuery.data?.pages.flatMap((p) => p.items) ?? [];

  const active = (goals ?? []).filter((g) => g.status === 'active').sort((a, b) => a.position - b.position);
  const northStar = active.find((g) => g.horizon === 'north_star') ?? null;
  // A week or day goal whose dates have passed but is still open is listed apart, so it doesn't pass for current work.
  const ended = active.filter((g) => g.horizon !== 'north_star' && isGoalEnded(g, now));
  const edit = (goal: HqGoal) => setDialog({ goal, horizon: goal.horizon });

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        title="Goals"
        description="Where the company is going. Agents read these every morning and suggest ideas that move them."
        actions={
          <Button onClick={() => setDialog({ goal: null, horizon: 'week' })}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      />

      {isLoading && !goals ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading goals…
        </div>
      ) : !goals ? (
        <LoadErrorState error={error} fallback="Could not load goals." onRetry={() => void refetch()} />
      ) : (
        <>
          {error && <RefreshErrorBanner />}
          <NorthStarCard goal={northStar} onEdit={edit} onCreate={() => setDialog({ goal: null, horizon: 'north_star' })} now={now} />

          {ended.length > 0 && (
            <Section
              title="Ended: close or roll over"
              count={ended.length}
              countTone="attention"
              description="Their dates have passed but they are still open. Edit a goal to mark it achieved or dropped, or to set new dates."
            >
              <Panel className="divide-y divide-slate-100 overflow-hidden">
                {ended.map((g) => (
                  <GoalRow key={g.id} goal={g} onEdit={edit} now={now} />
                ))}
              </Panel>
            </Section>
          )}

          {SECTIONS.map(({ horizon, hint }) => {
            const list = active.filter((g) => g.horizon === horizon && !isGoalEnded(g, now));
            return (
              <Section key={horizon} title={HORIZON_LABELS[horizon]} count={list.length} description={hint}>
                <Panel className="divide-y divide-slate-100 overflow-hidden">
                  {list.map((g) => (
                    <GoalRow key={g.id} goal={g} onEdit={edit} now={now} />
                  ))}
                  <AddGoalRow label={list.length === 0 ? `Set ${horizon === 'week' ? 'this week’s' : 'today’s'} goal` : 'Add another'} onClick={() => setDialog({ goal: null, horizon })} />
                </Panel>
              </Section>
            );
          })}

          <section>
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              aria-expanded={showPast}
              className={cn(HQ_LABEL, 'flex items-center gap-2 text-slate-700 hover:text-slate-950')}
            >
              <ChevronDown className={cn('h-4 w-4 transition', showPast && 'rotate-180')} />
              Past goals
              {showPast && pastQuery.data && (
                <span className="font-medium normal-case tracking-normal tabular-nums text-slate-600">
                  ({past.length}
                  {pastQuery.hasNextPage ? '+' : ''})
                </span>
              )}
            </button>
            {showPast &&
              (!pastQuery.data ? (
                pastQuery.isLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading past goals…
                  </div>
                ) : (
                  <div className="mt-3">
                    <LoadErrorState error={pastQuery.error} fallback="Could not load past goals." onRetry={() => void pastQuery.refetch()} />
                  </div>
                )
              ) : (
                <>
                  {pastQuery.isError && (
                    // Cached pages stay visible; a failed "Load more" (e.g. the
                    // cursor goal was deleted) must still be visible and
                    // recoverable — restart paging from the newest page.
                    <div className="mt-3">
                      <LoadErrorState
                        error={pastQuery.error}
                        fallback="Could not load more past goals."
                        onRetry={() => void queryClient.resetQueries({ queryKey: hqKeys.pastGoals() })}
                      />
                    </div>
                  )}
                  {past.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">Achieved and dropped goals will collect here.</p>
                  ) : (
                    <Panel className="mt-3 divide-y divide-slate-100 overflow-hidden opacity-80">
                      {past.map((g) => (
                        <GoalRow key={g.id} goal={g} onEdit={edit} now={now} />
                      ))}
                    </Panel>
                  )}
                  {pastQuery.hasNextPage && past.length > 0 && (
                    <div className="mt-4 flex justify-center">
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
