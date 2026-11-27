'use client';

import { useState } from 'react';
import { Check, ExternalLink, Lightbulb, Loader2, Radar, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAcceptHarnessIdea, useCreateHarnessIdea, useRefuseHarnessIdea, useScoutHarnessIdeas } from '@/hooks';
import { formatRelative } from '@/lib/hq-time';
import { cn } from '@/lib/utils';
import type { HarnessIdea, HarnessIdeaKind, HarnessMarket } from '@/types';
import { EmptyState, errorMessage, Panel, Section } from '../hq-ui';
import { inScope, MarketChip, marketName, MARKETS, type MarketScope } from './markets';

// Ideas: what could be made next. The Market Scout suggests; anyone on the
// team writes their own, and the HQ Assistant turns it into a plan. Nothing
// happens until a person accepts. A refusal, with its reason, is shown to the
// scout before its next round.

const KINDS: Array<{ value: HarnessIdeaKind; label: string }> = [
  { value: 'category', label: 'New category' },
  { value: 'event', label: 'Event (a date)' },
  { value: 'questions', label: 'Questions on a topic' },
  { value: 'other', label: 'Something else' },
];
const kindLabel = (k: HarnessIdeaKind) => KINDS.find((x) => x.value === k)?.label ?? 'Idea';

/** Only an http(s) address becomes a link. */
const safeLink = (v: string | null) => (v && /^https?:\/\//i.test(v) ? v : null);

/** Pure: the ideas a person still has to answer, under the scope. */
export function waitingIdeas(ideas: HarnessIdea[] | undefined, scope: MarketScope): HarnessIdea[] {
  return (ideas ?? []).filter((i) => i.status === 'open' && inScope(scope, i.market));
}

/** Pure: how many ideas wait per market (and in total under 'all'), for the switcher. */
export function waitingByMarket(ideas: HarnessIdea[] | undefined): Partial<Record<HarnessMarket, number>> {
  const out: Partial<Record<HarnessMarket, number>> = {};
  for (const i of ideas ?? []) {
    if (i.status !== 'open') continue;
    out[i.market] = (out[i.market] ?? 0) + 1;
  }
  return out;
}

function Steps({ idea }: { idea: HarnessIdea }) {
  const ok = new Set(idea.applied.filter((r) => r.ok).map((r) => r.index));
  const failed = new Map(idea.applied.filter((r) => !r.ok).map((r) => [r.index, r.error ?? 'failed']));
  const usable = idea.actions.filter((a) => a.valid);
  if (idea.actions.length === 0)
    return idea.status === 'open' ? <p className="text-[13px] text-slate-600">HQ cannot do this one by itself. Accepting keeps it on the list for a person to pick up.</p> : null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{idea.status === 'accepted' ? 'What was done' : `Accepting does ${usable.length === 1 ? 'this' : 'these'}`}</div>
      <ul className="mt-1 space-y-1">
        {idea.actions.map((a, i) => (
          <li key={i} className={cn('flex items-start gap-2 text-sm', !a.valid && 'text-slate-400 line-through')}>
            {ok.has(i) ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="done" /> : <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />}
            <span className="text-slate-800">
              {a.summary}
              {failed.has(i) && <span className="ml-1 text-red-700">({failed.get(i)})</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdeaCard({ idea, paused }: { idea: HarnessIdea; paused: boolean }) {
  const accept = useAcceptHarnessIdea();
  const refuse = useRefuseHarnessIdea();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const mine = idea.source === 'person';
  const link = safeLink(idea.sourceUrl);
  const busy = accept.isPending || refuse.isPending;
  const sayNo = () =>
    refuse.mutate(
      { id: idea.id, reason: reason.trim() },
      { onSuccess: () => toast.success(mine ? 'Dropped' : 'Refused: the scout sees it before its next round'), onError: (e) => toast.error(errorMessage(e, 'Could not refuse')) }
    );
  return (
    <Panel className={cn('space-y-3 p-4', (idea.status === 'refused' || idea.status === 'accepted') && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
        <span className="font-medium text-slate-800">{mine ? `${idea.createdBy ?? 'Someone'}'s idea` : `From the ${idea.agentName ?? 'Market Scout'}`}</span>
        <span>· {kindLabel(idea.kind)}</span>
        <span>· {formatRelative(idea.createdAt)}</span>
        <MarketChip market={idea.market} className="ml-auto" />
      </div>
      <div>
        {/* A person's idea is their own words; an agent's has a title and its reason. */}
        {!mine && <h3 className="font-display text-[17px] font-semibold leading-snug text-slate-950">{idea.title}</h3>}
        {idea.detail && <p className={cn('whitespace-pre-line text-sm', mine ? 'text-slate-900' : 'mt-1 text-slate-700')}>{idea.detail}</p>}
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-sky-700 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> The page behind it
          </a>
        )}
      </div>

      {idea.status === 'planning' && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> {paused ? 'Waiting: the agents are paused.' : 'The HQ Assistant is preparing a plan…'}
        </div>
      )}
      {idea.status === 'failed' && <p className="text-sm text-red-700">The plan could not be made: {idea.error ?? 'unknown error'}. Drop it and send it again.</p>}
      {idea.plan && (
        <div className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-950">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-violet-700">The plan</div>
          <p className="mt-0.5 whitespace-pre-line">{idea.plan}</p>
        </div>
      )}
      {(idea.status === 'open' || idea.status === 'accepted') && <Steps idea={idea} />}

      {idea.status === 'accepted' && <p className="text-[13px] font-medium text-emerald-700">Accepted{idea.decidedBy ? ` by ${idea.decidedBy}` : ''}.</p>}
      {idea.status === 'refused' && (
        <p className="text-[13px] text-slate-600">
          {mine ? 'Dropped' : 'Refused'}
          {idea.decidedBy ? ` by ${idea.decidedBy}` : ''}
          {idea.refuseReason ? `: ${idea.refuseReason}` : '.'}
        </p>
      )}

      {idea.status === 'open' && !refusing && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              accept.mutate(idea.id, {
                onSuccess: (r) => {
                  const bad = r.results.filter((x) => !x.ok).length;
                  if (bad) toast.error(`${r.results.length - bad} done, ${bad} could not be done`);
                  else toast.success(r.results.length ? 'Accepted: the agents start on it now' : 'Accepted: kept on the list');
                },
                onError: (e) => toast.error(errorMessage(e, 'Could not accept')),
              })
            }
          >
            {accept.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
            {idea.actions.some((a) => a.valid) ? 'Accept' : 'Keep on the list'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRefusing(true)}>
            <X className="mr-1.5 h-4 w-4" /> {mine ? 'Drop' : 'Refuse'}
          </Button>
        </div>
      )}
      {(idea.status === 'planning' || idea.status === 'failed') && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={sayNo}>
          {refuse.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <X className="mr-1.5 h-4 w-4" />} Drop
        </Button>
      )}
      {idea.status === 'open' && refusing && (
        <div className="space-y-2">
          <Label htmlFor={`refuse-${idea.id}`} className="text-[13px]">
            Why not? (optional{mine ? '' : ': the scout reads it'})
          </Label>
          <Textarea id={`refuse-${idea.id}`} autoFocus rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={refuse.isPending} placeholder="e.g. we did this in October; not before the season starts" />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={sayNo}>
              {refuse.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {mine ? 'Drop it' : 'Refuse it'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRefusing(false)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function OwnIdea({ market, paused }: { market: HarnessMarket; paused: boolean }) {
  const [text, setText] = useState('');
  const [where, setWhere] = useState<HarnessMarket>(market);
  const [kind, setKind] = useState<HarnessIdeaKind>('category');
  // Picking another market on the page moves the form with it (until the person picks one here).
  const [seen, setSeen] = useState(market);
  if (market !== seen) {
    setSeen(market);
    setWhere(market);
  }
  const create = useCreateHarnessIdea();
  const ready = [...text.trim()].length >= 10;
  return (
    <Panel className="space-y-3 p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="idea-text">What do you want to launch?</Label>
        <Textarea
          id="idea-text"
          rows={4}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={create.isPending}
          placeholder="e.g. A Dinamo Tbilisi category: the 1981 Cup Winners' Cup, the Soviet titles, today's squad"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="idea-where">For</Label>
          <Select value={where} onValueChange={(v) => setWhere(v as HarnessMarket)}>
            <SelectTrigger id="idea-where">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKETS.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="idea-kind">What kind</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as HarnessIdeaKind)}>
            <SelectTrigger id="idea-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        disabled={!ready || create.isPending}
        onClick={() =>
          create.mutate(
            { text: text.trim(), market: where, kind },
            {
              onSuccess: () => {
                setText('');
                toast.success('Sent: the HQ Assistant comes back with a plan');
              },
              onError: (e) => toast.error(errorMessage(e, 'Could not send the idea')),
            }
          )
        }
      >
        {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
        Send to the agents
      </Button>
      <p className="text-[13px] text-slate-600">
        {paused ? 'The agents are paused: your idea waits until they are switched on.' : 'You get a plan back in a minute or two: what will be made, how much, and what HQ cannot do by itself. Nothing starts until you accept it.'}
      </p>
    </Panel>
  );
}

export function Ideas({ ideas, scope, scouting, paused }: { ideas: HarnessIdea[] | undefined; scope: MarketScope; scouting: { market: HarnessMarket } | null | undefined; paused: boolean }) {
  const scout = useScoutHarnessIdeas();
  const all = (ideas ?? []).filter((i) => inScope(scope, i.market));
  const fromAgents = all.filter((i) => i.source === 'agent' && i.status === 'open');
  const mine = all.filter((i) => i.source === 'person' && (i.status === 'planning' || i.status === 'open' || i.status === 'failed'));
  const decided = all.filter((i) => i.status === 'accepted' || i.status === 'refused').slice(0, 12);
  const where = scope.market === 'all' ? 'every market' : marketName(scope.market);
  return (
    <div className="space-y-8">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section
          title="From the agents"
          count={fromAgents.length}
          description="The Market Scout looks every Monday. Accept, and the agents start; refuse, and it learns."
          actions={
            <Button
              size="sm"
              variant="outline"
              disabled={scout.isPending || !!scouting || paused}
              title={paused ? 'The agents are paused' : undefined}
              onClick={() =>
                scout.mutate(scope.market, {
                  onSuccess: () => toast.success(`The scout is looking at ${where}. Its ideas appear here in a few minutes.`),
                  onError: (e) => toast.error(errorMessage(e, 'Could not ask the scout')),
                })
              }
            >
              {scout.isPending || scouting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Radar className="mr-1.5 h-4 w-4" />}
              {scouting ? 'The scout is looking…' : scope.market === 'all' ? 'Ask for ideas' : `Ask for ideas for ${marketName(scope.market)}`}
            </Button>
          }
        >
          {fromAgents.length === 0 ? (
            <Panel>
              <EmptyState className="px-4 py-3">
                {scouting ? 'The scout is looking now. Its ideas appear here in a few minutes.' : `No ideas waiting for ${where}. Ask the scout for some, or write your own.`}
              </EmptyState>
            </Panel>
          ) : (
            <div className="space-y-3">
              {fromAgents.map((i) => (
                <IdeaCard key={i.id} idea={i} paused={paused} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Your own idea" description="Say it in your own words. The HQ Assistant turns it into a plan you can accept.">
          <OwnIdea market={scope.market} paused={paused} />
          {mine.map((i) => (
            <IdeaCard key={i.id} idea={i} paused={paused} />
          ))}
        </Section>
      </div>

      {decided.length > 0 && (
        <Section title="Decided lately" description="The last two weeks.">
          <div className="grid gap-3 lg:grid-cols-2">
            {decided.map((i) => (
              <IdeaCard key={i.id} idea={i} paused={paused} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/** On Today: the newest ideas waiting, with a way to the Ideas tab. */
export function IdeasSummary({ ideas, scope, onOpen }: { ideas: HarnessIdea[] | undefined; scope: MarketScope; onOpen: () => void }) {
  const waiting = waitingIdeas(ideas, scope);
  if (waiting.length === 0) return null;
  return (
    <Section
      title="Ideas waiting for you"
      count={waiting.length}
      actions={
        <Button size="sm" variant="outline" onClick={onOpen}>
          <Lightbulb className="mr-1.5 h-4 w-4" /> Open ideas
        </Button>
      }
    >
      <Panel className="divide-y divide-slate-100">
        {waiting.slice(0, 3).map((i) => (
          <button key={i.id} type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">{i.title}</span>
              <span className="block text-[12px] text-slate-600">{i.source === 'person' ? `${i.createdBy ?? 'Someone'}'s idea, planned` : `From the ${i.agentName ?? 'Market Scout'}`}</span>
            </span>
            <MarketChip market={i.market} />
          </button>
        ))}
      </Panel>
    </Section>
  );
}
