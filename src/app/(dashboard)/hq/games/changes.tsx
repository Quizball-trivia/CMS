'use client';

import { useState } from 'react';
import { ExternalLink, Hammer, Loader2, PencilLine, Play, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useBuildGameChange, useCancelGameChange, useCreateGameChange, useDiscardGameChange, useGameBuildingConnected, useMergeGameChange, useReplanGameChange } from '@/hooks';
import { formatRelative } from '@/lib/hq-time';
import { cn } from '@/lib/utils';
import type { HarnessGame, HarnessGameBuild, HarnessGameChange, HarnessGameChangeStatus } from '@/types';
import { EmptyState, errorMessage, Panel, Section } from '../hq-ui';

// Changes to a game: someone writes what they want changed, the Game Planner
// turns it into a plan in plain words, and from there it is built, played and
// approved. Building happens on GitHub: an agent writes the change on top of
// staging, HQ opens the pull request, and a person approves the merge here.

const STATUS: Record<HarnessGameChangeStatus, { label: string; tone: string }> = {
  suggested: { label: 'Suggested by an agent', tone: 'bg-violet-50 text-violet-700' },
  planning: { label: 'Being planned', tone: 'bg-sky-50 text-sky-700' },
  planned: { label: 'Plan ready', tone: 'bg-amber-50 text-amber-800' },
  building: { label: 'Being built', tone: 'bg-sky-50 text-sky-700' },
  ready: { label: 'Ready to play', tone: 'bg-emerald-50 text-emerald-700' },
  merged: { label: 'Done', tone: 'bg-emerald-50 text-emerald-700' },
  declined: { label: 'Declined', tone: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-600' },
  failed: { label: 'Could not be planned', tone: 'bg-red-50 text-red-700' },
};
const OPEN: HarnessGameChangeStatus[] = ['suggested', 'planning', 'planned', 'building', 'ready', 'failed'];
const STEPS = ['Asked', 'Planned', 'Built', 'Approved', 'Live'];
/** How far along a change is, as the index of the last step it has passed. */
// Merged means merged into staging: it is live only after the next release.
const stepOf = (s: HarnessGameChangeStatus) => ({ suggested: -1, planning: 0, failed: 0, planned: 1, building: 1, ready: 2, merged: 3, declined: -1, cancelled: -1 })[s];
const SIZE = { small: 'Small change', medium: 'Medium change', large: 'Large change' };
const AREA = { website: 'Website', server: 'Server', both: 'Website and server' };

export const isOpenChange = (c: HarnessGameChange) => OPEN.includes(c.status);

/** The form on a game's card. */
export function AskForChange({ game, onClose }: { game: HarnessGame | null; onClose: () => void }) {
  const create = useCreateGameChange();
  const [title, setTitle] = useState('');
  const [request, setRequest] = useState('');
  const ok = title.trim().length >= 3 && request.trim().length >= 10;
  const close = () => {
    if (create.isPending) return;
    setTitle('');
    setRequest('');
    onClose();
  };
  const send = () => {
    if (!game || !ok) return;
    create.mutate(
      { gameKey: game.key, title: title.trim(), request: request.trim() },
      {
        onSuccess: (c) => {
          toast.success(`Change ${c.number} sent to the planner. Its plan appears under Changes in a few minutes.`);
          setTitle('');
          setRequest('');
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not send the request')),
      }
    );
  };
  return (
    <Dialog open={!!game} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ask for a change to {game?.name}</DialogTitle>
          <DialogDescription>
            Say what should be different, in your own words. An agent reads the game&apos;s code and writes a plan for you to read first: nothing is built until you have seen it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-900">In a few words</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Four lives instead of three" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-900">What should change, and why</span>
            <Textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={6}
              maxLength={6000}
              placeholder="e.g. Most players are out before they finish the list. Give four lives instead of three in the daily game, and keep three when friends play in a room."
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!ok || create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Send to the planner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Steps({ status }: { status: HarnessGameChangeStatus }) {
  const at = stepOf(status);
  if (at < 0) return null;
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[12px]" aria-label="How far along this change is">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cn('rounded px-1.5 py-0.5 font-medium', i <= at ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500')} aria-current={i === at ? 'step' : undefined}>
            {s}
          </span>
          {i < STEPS.length - 1 && <span className={cn('h-px w-3', i < at ? 'bg-slate-900' : 'bg-slate-200')} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="ml-4 list-disc space-y-0.5 text-sm text-slate-800">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

const PART = { website: 'Website', server: 'Server' };
const safeUrl = (u: string | null) => (u && /^https:\/\//.test(u) ? u : null);

function Out({ href, children }: { href: string | null; children: React.ReactNode }) {
  const url = safeUrl(href);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-slate-900 underline-offset-2 hover:underline">
      {children} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

/** One built part: where it is, and the ways to look at it. */
function BuildRow({ b }: { b: HarnessGameBuild }) {
  const preview = safeUrl(b.previewUrl);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="w-16 shrink-0 font-medium text-slate-950">{PART[b.part]}</span>
      <span className="min-w-0 flex-1 basis-40 text-slate-700">
        {b.merged ? (
          'Merged into staging.'
        ) : b.state === 'starting' ? (
          'Waiting for the agent to start.'
        ) : b.state === 'running' ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> An agent is writing and checking it.
          </span>
        ) : b.state === 'failed' ? (
          <span className="text-red-800">{b.error ?? 'The build failed.'}</span>
        ) : b.part === 'server' ? (
          'Built and checked. It can be played on staging once it is merged.'
        ) : preview ? (
          'Built and checked. Play it before you approve.'
        ) : (
          'Built and checked. Its preview is still being prepared.'
        )}
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {preview && !b.merged && (
          <a href={preview} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-950 px-2.5 font-medium text-white hover:bg-slate-800">
            <Play className="h-3.5 w-3.5" aria-hidden /> Play the preview
          </a>
        )}
        <Out href={b.prUrl}>The code{b.prNumber ? ` (#${b.prNumber})` : ''}</Out>
        {!b.prUrl && <Out href={b.runUrl}>The agent&apos;s run</Out>}
        {b.state === 'failed' && b.prUrl && <Out href={b.runUrl}>The agent&apos;s run</Out>}
      </span>
    </li>
  );
}

function Change({ c }: { c: HarnessGameChange }) {
  const replan = useReplanGameChange();
  const cancel = useCancelGameChange();
  const build = useBuildGameChange();
  const merge = useMergeGameChange();
  const discard = useDiscardGameChange();
  const connected = useGameBuildingConnected();
  const [approving, setApproving] = useState(false);
  const builds = c.builds ?? [];
  // A failure with a plan still on the card is a build that failed; without one, the planner failed.
  const buildFailed = c.status === 'failed' && !!c.plan;
  const canBuild = !!c.plan && (c.status === 'planned' || buildFailed) && connected === true;
  const startBuild = () =>
    build.mutate(c.id, {
      onSuccess: (r) => (r.status === 'failed' ? toast.error(r.error ?? 'The build could not be started.') : toast.success(`An agent is building change ${c.number}. It usually takes 10 to 30 minutes.`)),
      onError: (e) => toast.error(errorMessage(e, 'Could not start the build')),
    });
  const approve = () => {
    const seen: Partial<Record<'web' | 'backend', string>> = {};
    for (const b of builds) if (b.headSha) seen[b.repo] = b.headSha;
    merge.mutate(
      { id: c.id, seen },
      { onSuccess: () => { setApproving(false); toast.success(`Change ${c.number} is merged into staging.`); }, onError: (e) => { setApproving(false); toast.error(errorMessage(e, 'Could not merge it')); } }
    );
  };
  const drop = () => discard.mutate(c.id, { onSuccess: () => toast.success(`Change ${c.number} dropped.`), onError: (e) => toast.error(errorMessage(e, 'Could not drop it')) });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.request);
  const st = buildFailed ? { label: 'Build failed', tone: STATUS.failed.tone } : STATUS[c.status];
  const busy = replan.isPending || cancel.isPending || build.isPending || merge.isPending || discard.isPending;
  const canChange = ['planning', 'planned', 'failed', 'suggested'].includes(c.status);
  // The editor opens on the request as it is now (someone else may have rewritten it since this card first drew).
  const startEditing = () => {
    setText(c.request);
    setEditing(true);
  };
  const sendAgain = () =>
    replan.mutate({ id: c.id, request: c.request }, { onSuccess: () => toast.success('Sent to the planner again.'), onError: (e) => toast.error(errorMessage(e, 'Could not send it again')) });
  const save = () =>
    replan.mutate(
      { id: c.id, request: text.trim() },
      { onSuccess: () => { setEditing(false); toast.success('Sent back to the planner.'); }, onError: (e) => toast.error(errorMessage(e, 'Could not send it back')) }
    );
  return (
    <Panel as="article" aria-label={`Change ${c.number}`} className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[12px] text-slate-500">
            Change {c.number} · {c.gameName} · {c.source === 'agent' ? 'suggested by an agent' : `asked by ${c.requestedBy ?? 'the team'}`} · {formatRelative(c.createdAt)}
          </p>
          <h3 className="font-semibold tracking-tight text-slate-950">{c.title}</h3>
        </div>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium', st.tone)}>{st.label}</span>
      </div>
      <Steps status={c.status} />
      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{c.request}</p>

      {c.status === 'planning' && (
        <p className="flex items-center gap-2 text-sm text-sky-800">
          <Loader2 className="h-4 w-4 animate-spin" /> The planner is reading the game&apos;s code. A plan usually takes a few minutes.
        </p>
      )}
      {c.status === 'failed' && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{buildFailed ? `The build did not finish. ${c.error ?? ''}` : `The planner could not finish: ${c.error ?? 'no reason given'}.`}</p>
      )}

      {c.plan && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
            <span className="text-sm font-semibold text-slate-950">The plan</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">{SIZE[c.plan.size]}</span>
          </div>
          <p className="text-sm text-slate-900">{c.plan.summary}</p>
          {c.plan.questions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-semibold text-amber-900">The planner needs to know</p>
              <ul className="ml-4 list-disc space-y-0.5 text-sm text-amber-900">
                {c.plan.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <p className="mt-1 text-[13px] text-amber-900">Answer by rewriting the request; it is planned again.</p>
            </div>
          )}
          {c.plan.changes.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">What changes</p>
              <ul className="space-y-1 text-sm text-slate-800">
                {c.plan.changes.map((x, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{AREA[x.area]}</span>
                    <span>{x.what}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <List title="What could go wrong" items={c.plan.risks} />
          <List title="How to check it by playing" items={c.plan.test} />
          {(c.status === 'planned' || buildFailed) && connected !== true && (
            <p className="text-[13px] text-slate-600">
              {connected === false
                ? 'Building is not connected yet: HQ has no access to GitHub. The plan stays here until it is set up.'
                : 'Building from a plan is not available on this server yet. The plan stays here until it is.'}
            </p>
          )}
          {canBuild && c.plan.questions.length > 0 && <p className="text-[13px] text-slate-600">You can build it as planned, or answer the planner first by rewriting the request.</p>}
        </div>
      )}

      {builds.length > 0 && ['building', 'ready', 'merged', 'failed'].includes(c.status) && (
        <div className="rounded-lg border border-slate-200">
          <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-950">
            {c.status === 'building' ? 'Being built' : c.status === 'ready' ? 'Built: play it, then approve' : c.status === 'merged' ? 'Merged into staging' : 'The last build'}
          </p>
          <ul className="divide-y divide-slate-100">
            {builds.map((b) => (
              <BuildRow key={b.repo} b={b} />
            ))}
          </ul>
          {c.status === 'ready' && c.error && <p className="border-t border-slate-100 px-3 py-2 text-sm text-red-800">{c.error}</p>}
          {c.status === 'merged' && <p className="border-t border-slate-100 px-3 py-2 text-[13px] text-slate-600">Approved by {c.decidedBy ?? 'the team'}. It reaches players with the next release from staging.</p>}
        </div>
      )}

      {(c.status === 'building' || c.status === 'ready') && (
        <div className="flex flex-wrap items-center gap-2">
          {c.status === 'ready' &&
            (approving ? (
              <>
                <span className="text-sm text-slate-800">Merge change {c.number} into staging?</span>
                <Button size="sm" onClick={approve} disabled={busy}>
                  {merge.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Yes, merge it
                </Button>
                <Button size="sm" variant="outline" onClick={() => setApproving(false)} disabled={busy}>
                  Not yet
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => setApproving(true)} disabled={busy || connected !== true}>
                  Approve and merge
                </Button>
                <Button size="sm" variant="outline" onClick={startBuild} disabled={busy || connected !== true} aria-label={`Build change ${c.number} again`}>
                  {build.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Hammer className="mr-1 h-3.5 w-3.5" />} Build it again
                </Button>
              </>
            ))}
          {!approving && (
            <Button size="sm" variant="ghost" onClick={drop} disabled={busy} aria-label={`Drop change ${c.number}`}>
              {discard.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />} {c.status === 'building' ? 'Stop and drop it' : 'Drop it'}
            </Button>
          )}
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <Textarea aria-label={`Rewrite the request for change ${c.number}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={6000} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy || text.trim().length < 10 || text.trim() === c.request}>
              {replan.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Plan it again
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setText(c.request); }} disabled={busy}>
              Keep it as it was
            </Button>
          </div>
        </div>
      ) : (
        canChange && (
          <div className="flex flex-wrap gap-2">
            {canBuild && (
              <Button size="sm" onClick={startBuild} disabled={busy} aria-label={`Build change ${c.number}`}>
                {build.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Hammer className="mr-1 h-3.5 w-3.5" />} {buildFailed ? 'Build it again' : 'Build it'}
              </Button>
            )}
            {c.status === 'failed' && !buildFailed && (
              <Button size="sm" onClick={sendAgain} disabled={busy} aria-label={`Send change ${c.number} to the planner again`}>
                {replan.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Send it again
              </Button>
            )}
            {c.status !== 'suggested' && (
              <Button size="sm" variant="outline" onClick={startEditing} disabled={busy}>
                <PencilLine className="mr-1 h-3.5 w-3.5" /> Rewrite the request
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancel.mutate(c.id, { onSuccess: () => toast.success(`Change ${c.number} cancelled.`), onError: (e) => toast.error(errorMessage(e, 'Could not cancel it')) })}
              disabled={busy}
              aria-label={`Cancel change ${c.number}`}
            >
              {cancel.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />} Cancel it
            </Button>
          </div>
        )
      )}
    </Panel>
  );
}

/** The list of changes on the Games page: open ones, then what ended recently. */
export function Changes({ changes, failed }: { changes: HarnessGameChange[] | undefined; failed: boolean }) {
  const [showOld, setShowOld] = useState(false);
  const open = (changes ?? []).filter(isOpenChange);
  const old = (changes ?? []).filter((c) => !isOpenChange(c));
  return (
    <Section
      title="Changes"
      count={open.filter((c) => c.status === 'planned' || c.status === 'ready' || c.status === 'failed').length}
      countTone="attention"
      description="What the team asked to change. An agent plans each one first; you read the plan before anything is built, and play what was built before it is merged."
      actions={
        old.length > 0 ? (
          <button type="button" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline" onClick={() => setShowOld((v) => !v)}>
            {showOld ? 'Hide finished' : `Show ${old.length} finished`}
          </button>
        ) : undefined
      }
    >
      {!changes ? (
        <EmptyState>{failed ? 'Could not load the changes.' : 'Loading…'}</EmptyState>
      ) : open.length === 0 && !showOld ? (
        <EmptyState>No changes in progress. Press “Ask for a change” on any game below.</EmptyState>
      ) : (
        <div className="space-y-3">
          {[...open, ...(showOld ? old : [])].map((c) => (
            <Change key={c.id} c={c} />
          ))}
        </div>
      )}
    </Section>
  );
}
