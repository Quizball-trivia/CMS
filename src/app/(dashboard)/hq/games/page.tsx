'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, MessageSquarePlus, Play, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHarnessGameChanges, useHarnessGames } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HarnessGame, HarnessGameGroup, HarnessGameState } from '@/types';
import { Delta, EmptyState, HQ_PAGE, LoadErrorState, Meter, PageHeader, Panel, RefreshErrorBanner, Section } from '../hq-ui';
import { AskForChange, Changes, isOpenChange } from './changes';
import { finishRate, GROUPS, PREVIEW_SITE, previewUrl, size, worthALook } from './games';

// The Games hub: every game the product has, on one page. Play any of them
// right here (the staging site's previews: real game screens on sample data,
// no login and no opponent needed), and see how each is doing: the last 7
// whole days against the 7 before, and for daily games how many of the
// players who start a day finish it.

const STATE: Record<HarnessGameState, { label: string; tone: string }> = {
  on: { label: 'On', tone: 'bg-emerald-50 text-emerald-700' },
  beta: { label: 'Beta', tone: 'bg-sky-50 text-sky-700' },
  paused: { label: 'Paused', tone: 'bg-amber-50 text-amber-800' },
  off: { label: 'Switched off', tone: 'bg-slate-100 text-slate-600' },
  retired: { label: 'Retired', tone: 'bg-slate-100 text-slate-600' },
};
/** "20 Nov" from a YYYY-MM-DD day. */
const day = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
/** The number a card leads with: daily starts when the game has a daily, otherwise what was played. */
function Lead({ game }: { game: HarnessGame }) {
  const { started, played } = game.stats;
  const main = started ?? played;
  if (!main) return <p className="text-[13px] text-slate-500">Plays are not counted for this game yet.</p>;
  const label = started ? 'started a day' : game.key === 'orshabatoba' ? 'players took part' : 'played';
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <b className="text-2xl font-semibold tabular-nums tracking-tight text-slate-950">{main.now.toLocaleString()}</b>
      <span className="text-[13px] text-slate-600">{label}</span>
      <Delta now={main.now} before={main.before} />
    </p>
  );
}

function GameCard({ game, onPlay, onAsk, openChanges }: { game: HarnessGame; onPlay: () => void; onAsk: () => void; openChanges: number }) {
  const st = STATE[game.state];
  const rate = finishRate(game);
  const friends = game.stats.started ? game.stats.played : null;
  return (
    <Panel as="article" className="flex flex-col gap-3 p-4 transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold tracking-tight text-slate-950">{game.name}</h3>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium', st.tone)}>{st.label}</span>
      </div>
      <p className="line-clamp-2 min-h-[2.4rem] text-[13px] leading-snug text-slate-600">{game.what}</p>
      <Lead game={game} />
      {(rate !== null || friends) && (
        <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
          {rate !== null && (
            <div>
              <div className="flex items-baseline justify-between">
                <span>Finished the day</span>
                <b className={cn('tabular-nums', rate < 40 ? 'text-red-700' : 'text-slate-950')}>{rate}%</b>
              </div>
              <Meter pct={rate} tone={rate < 40 ? 'bad' : rate < 60 ? 'attention' : 'good'} className="mt-1" />
            </div>
          )}
          {friends && (
            <div className="flex items-baseline justify-between gap-2">
              <span>With friends</span>
              <span className="flex items-baseline gap-2">
                <b className="tabular-nums text-slate-950">{friends.now.toLocaleString()}</b>
                <Delta now={friends.now} before={friends.before} />
              </span>
            </div>
          )}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {game.preview ? (
          <Button size="sm" onClick={onPlay} aria-label={`Play ${game.name}`}>
            <Play className="mr-1 h-3.5 w-3.5" /> Play
          </Button>
        ) : (
          <span className="rounded bg-slate-100 px-1.5 py-1 text-[12px] text-slate-600">No preview yet</span>
        )}
        <Button size="sm" variant="outline" onClick={onAsk} aria-label={`Ask for a change to ${game.name}`}>
          <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Ask for a change
        </Button>
        {game.route && (
          <a className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 underline-offset-2 hover:underline" href={`${PREVIEW_SITE}${game.route}`} target="_blank" rel="noreferrer">
            Open the real game <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
      {openChanges > 0 && (
        <p className="text-[12px] font-medium text-sky-700">
          {openChanges} change{openChanges === 1 ? '' : 's'} in progress
        </p>
      )}
    </Panel>
  );
}

function PlayDialog({ game, onClose }: { game: HarnessGame | null; onClose: () => void }) {
  const url = game ? previewUrl(game) : null;
  return (
    <Dialog open={!!game} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-3 sm:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>{game?.name}</DialogTitle>
          <DialogDescription>
            {game?.preview?.kind === 'playground'
              ? 'The playground: pick any screen of the game on the left, play it, and change its situation. It runs on sample data, so nothing here reaches players.'
              : 'A demo run on sample data: no login and no opponent needed. Nothing here reaches players.'}{' '}
            {url && (
              <a className="font-medium text-slate-900 underline-offset-2 hover:underline" href={url} target="_blank" rel="noreferrer">
                Open in a new tab
              </a>
            )}
          </DialogDescription>
        </DialogHeader>
        {url && (
          <iframe
            key={url}
            title={`${game?.name} preview`}
            src={url}
            className="min-h-0 w-full flex-1 rounded-lg border border-slate-200 bg-slate-950"
            // The preview is our own staging site; it needs its scripts, its own storage, and sound.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            allow="autoplay; fullscreen"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function HqGamesPage() {
  const { data, error, isLoading, refetch } = useHarnessGames();
  const changes = useHarnessGameChanges();
  const [playing, setPlaying] = useState<HarnessGame | null>(null);
  const [asking, setAsking] = useState<HarnessGame | null>(null);
  const openFor = (key: string) => (changes.data ?? []).filter((c) => c.gameKey === key && isOpenChange(c)).length;
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<HarnessGameGroup | 'all'>('all');
  const wanted = query.trim().toLowerCase();
  const shown = (g: HarnessGame) => (group === 'all' || g.group === group) && (!wanted || g.name.toLowerCase().includes(wanted) || g.what.toLowerCase().includes(wanted));
  const flags = data ? worthALook(data.games) : [];

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow="HQ"
        title="Games"
        description="Every game we have. Play any of them here, and see how each is doing: the last 7 whole days against the 7 before."
      />

      {error && !data ? (
        <LoadErrorState error={error} fallback="Could not load the games" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Counting the last two weeks of plays…
        </div>
      ) : (
        <>
          {error && <RefreshErrorBanner />}

          <Changes changes={changes.data} failed={!!changes.error} />

          <Section title="Worth a look" count={flags.length} countTone="attention" description="Games where most players who start do not finish, or where plays fell by a third in a week.">
            {flags.length === 0 ? (
              <EmptyState>Nothing stands out this week.</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {flags.map((f) => (
                  <div key={f.game.key} className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <b className="block font-semibold text-slate-950">{f.game.name}</b>
                      <span className="text-slate-700">{f.reason}</span>
                    </span>
                    {f.game.preview && (
                      <Button size="sm" variant="outline" className="shrink-0 bg-white" onClick={() => setPlaying(f.game)} aria-label={`Play ${f.game.name} from the list`}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Play
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-y border-slate-200 bg-slate-50/95 px-1 py-2 backdrop-blur">
            <label className="relative w-full sm:w-auto">
              <span className="sr-only">Find a game</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a game"
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 sm:w-56"
              />
            </label>
            {/* One row that scrolls sideways on a phone (by touch), so the bar stays short while it sticks to the top; from
                tablet width up the buttons wrap instead, so a mouse reaches every one. */}
            <div className="flex max-w-full gap-1 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:overflow-visible" role="group" aria-label="Kind of game">
              {[{ key: 'all' as const, title: 'All' }, ...GROUPS].map((g) => {
                const n = g.key === 'all' ? data.games.length : data.games.filter((x) => x.group === g.key).length;
                if (n === 0) return null;
                return (
                  <button
                    key={g.key}
                    type="button"
                    aria-pressed={group === g.key}
                    onClick={() => setGroup(g.key)}
                    className={cn('rounded-md px-2.5 py-1.5 text-[13px] font-medium transition', group === g.key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-950')}
                  >
                    {g.title} <span className={cn('tabular-nums', group === g.key ? 'text-slate-300' : 'text-slate-400')}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {data.games.filter(shown).length === 0 && <EmptyState>No game matches “{query}”.</EmptyState>}

          {GROUPS.map((group) => {
            const games = data.games.filter((g) => g.group === group.key && shown(g)).sort((a, b) => size(b) - size(a));
            if (games.length === 0) return null;
            return (
              <Section key={group.key} title={group.title} count={games.length} description={group.description}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {games.map((g) => (
                    <GameCard key={g.key} game={g} onPlay={() => setPlaying(g)} onAsk={() => setAsking(g)} openChanges={openFor(g.key)} />
                  ))}
                </div>
              </Section>
            );
          })}

          <p className="text-[13px] text-slate-600">
            {data.weeks ? `Numbers are for ${day(data.weeks.now[0])} to ${day(data.weeks.now[1])}, compared with ${day(data.weeks.before[0])} to ${day(data.weeks.before[1])}. ` : ''}
            Only real players count. A daily game counts players who started a day, the live show counts players who took part, and the other numbers count games played. Previews run on the staging site ({PREVIEW_SITE.replace(/^https?:\/\//, '')}).
          </p>
        </>
      )}

      <PlayDialog game={playing} onClose={() => setPlaying(null)} />
      <AskForChange game={asking} onClose={() => setAsking(null)} />
    </div>
  );
}
