'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHarnessGames } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HarnessCounted, HarnessGame, HarnessGameState } from '@/types';
import { EmptyState, HQ_PAGE, LoadErrorState, PageHeader, Panel, RefreshErrorBanner, Section } from '../hq-ui';
import { change, finishRate, GROUPS, PREVIEW_SITE, previewUrl, size, worthALook } from './games';

// The Games hub: every game the product has, on one page. Play any of them
// right here (the staging site's previews: real game screens on sample data,
// no login and no opponent needed), and see how each is doing: plays in the
// last 7 days against the 7 before, and for daily games how many of the
// players who start a day finish it.

const STATE: Record<HarnessGameState, { label: string; tone: string }> = {
  on: { label: 'On', tone: 'bg-emerald-50 text-emerald-700' },
  beta: { label: 'Beta', tone: 'bg-sky-50 text-sky-700' },
  paused: { label: 'Paused', tone: 'bg-amber-50 text-amber-800' },
  off: { label: 'Switched off', tone: 'bg-slate-100 text-slate-600' },
  retired: { label: 'Retired', tone: 'bg-slate-100 text-slate-600' },
};
const CHANGE_TONE = { up: 'text-emerald-700', down: 'text-red-700', flat: 'text-slate-500' } as const;

function Count({ c, label }: { c: HarnessCounted; label: string }) {
  const ch = change(c);
  return (
    <span className="whitespace-nowrap">
      <b className="tabular-nums text-slate-950">{c.now.toLocaleString()}</b> {label}
      {ch && <span className={cn('ml-1 tabular-nums', CHANGE_TONE[ch.tone])}>({ch.text})</span>}
    </span>
  );
}

function Numbers({ game }: { game: HarnessGame }) {
  const { started, played } = game.stats;
  const rate = finishRate(game);
  if (!started && !played) return <p className="text-[13px] text-slate-500">Plays are not counted for this game yet.</p>;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
      {started && <Count c={started} label="started a day" />}
      {rate !== null && (
        <span className="whitespace-nowrap">
          <b className={cn('tabular-nums', rate < 40 ? 'text-red-700' : 'text-slate-950')}>{rate}%</b> finished it
        </span>
      )}
      {played && <Count c={played} label={started ? 'games with friends' : 'played'} />}
    </p>
  );
}

function GameCard({ game, onPlay }: { game: HarnessGame; onPlay: () => void }) {
  const st = STATE[game.state];
  return (
    <Panel as="article" className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-slate-900">{game.name}</h3>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium', st.tone)}>{st.label}</span>
      </div>
      <p className="text-[13px] text-slate-600">{game.what}</p>
      <Numbers game={game} />
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {game.preview ? (
          <Button size="sm" onClick={onPlay} aria-label={`Play ${game.name}`}>
            <Play className="mr-1 h-3.5 w-3.5" /> Play
          </Button>
        ) : (
          <span className="text-[12px] text-slate-500">No preview yet</span>
        )}
        {game.route && (
          <a className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 underline-offset-2 hover:underline" href={`${PREVIEW_SITE}${game.route}`} target="_blank" rel="noreferrer">
            Open the real game <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
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
  const [playing, setPlaying] = useState<HarnessGame | null>(null);
  const flags = data ? worthALook(data.games) : [];

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow="HQ"
        title="Games"
        description="Every game we have. Play any of them here, and see how each is doing: plays in the last 7 days against the 7 before."
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

          <Section title="Worth a look" count={flags.length} countTone="attention" description="Games where most players who start do not finish, or where plays fell by a third in a week.">
            {flags.length === 0 ? (
              <EmptyState>Nothing stands out this week.</EmptyState>
            ) : (
              <Panel className="divide-y divide-slate-100">
                {flags.map((f) => (
                  <div key={f.game.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                    <span>
                      <b className="font-medium text-slate-900">{f.game.name}</b> <span className="text-slate-700">{f.reason}</span>
                    </span>
                    {f.game.preview && (
                      <Button size="sm" variant="outline" onClick={() => setPlaying(f.game)} aria-label={`Play ${f.game.name} from the list`}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Play
                      </Button>
                    )}
                  </div>
                ))}
              </Panel>
            )}
          </Section>

          {GROUPS.map((group) => {
            const games = data.games.filter((g) => g.group === group.key).sort((a, b) => size(b) - size(a));
            if (games.length === 0) return null;
            return (
              <Section key={group.key} title={group.title} count={games.length} description={group.description}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {games.map((g) => (
                    <GameCard key={g.key} game={g} onPlay={() => setPlaying(g)} />
                  ))}
                </div>
              </Section>
            );
          })}

          <p className="text-[13px] text-slate-600">
            Previews run on the staging site ({PREVIEW_SITE.replace(/^https?:\/\//, '')}). A daily game counts players who started a day; the other numbers count games played.
          </p>
        </>
      )}

      <PlayDialog game={playing} onClose={() => setPlaying(null)} />
    </div>
  );
}
