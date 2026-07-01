'use client';

import { useState } from 'react';
import { Inbox, Loader2, Check, X, CalendarClock, Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useReviewQueue, useApproveQuestion, useRejectQuestion } from '@/hooks';
import { getLocalizedTextByLang } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AgentNav } from '../agent-ui';
import type { AgentReviewGroup, AgentReviewItem } from '@/types';

function SourceBadge({ source }: { source: string }) {
  if (source === 'daily') {
    return (
      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
        <CalendarClock className="mr-1 h-3 w-3" /> Daily
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
      <Trophy className="mr-1 h-3 w-3" /> Ranked
    </Badge>
  );
}

function ReviewItem({ item }: { item: AgentReviewItem }) {
  const approve = useApproveQuestion();
  const reject = useRejectQuestion();
  const [open, setOpen] = useState(false);
  const busy = approve.isPending || reject.isPending;

  const options = item.payload?.options ?? [];
  const factcheck = item.verdicts?.factcheck as { reason?: string; correct_answer?: string } | undefined;
  const criteria = item.verdicts?.criteria as { suggestions?: string } | undefined;

  const handleApprove = () =>
    approve.mutate(item.id, {
      onSuccess: () => toast.success('Approved — question is now live'),
      onError: () => toast.error('Failed to approve'),
    });
  const handleReject = () =>
    reject.mutate(item.id, {
      onSuccess: () => toast.success('Rejected — question archived'),
      onError: () => toast.error('Failed to reject'),
    });

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={() => setOpen((v) => !v)} className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-600">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-slate-900">
            {getLocalizedTextByLang(item.prompt, 'ka', '—')}
          </p>
          <p className="mt-0.5 break-words text-xs text-slate-400">
            {getLocalizedTextByLang(item.prompt, 'en')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={handleReject} disabled={busy} className="text-red-600 hover:bg-red-50">
            <X className="h-4 w-4" /> Reject
          </Button>
          <Button size="sm" onClick={handleApprove} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
            {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
          </Button>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 bg-slate-50 px-4 py-3 pl-11">
          {/* options */}
          {options.length > 0 ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {options.map((o, i) => (
                <div
                  key={i}
                  className={
                    o.is_correct
                      ? 'flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5'
                      : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5'
                  }
                >
                  {o.is_correct ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words text-sm text-slate-700">{getLocalizedTextByLang(o.text, 'ka', '—')}</span>
                    <span className="break-words text-xs text-slate-400">{getLocalizedTextByLang(o.text, 'en')}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* verdicts — why it passed the gates */}
          <div className="flex flex-wrap gap-2 text-xs">
            {factcheck?.reason ? (
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
                <span className="font-semibold text-slate-500">Fact-check:</span> {factcheck.reason}
              </span>
            ) : null}
            {criteria?.suggestions ? (
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
                <span className="font-semibold text-slate-500">Criteria:</span> {criteria.suggestions}
              </span>
            ) : null}
            {item.warnings && item.warnings.length > 0 ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                ⚠ {item.warnings.join(', ')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Group({ group }: { group: AgentReviewGroup }) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <SourceBadge source={group.source} />
        <span className="text-sm font-semibold text-slate-800">{group.topic || 'Untitled'}</span>
        <span className="ml-auto text-xs font-medium text-slate-400">{group.count} waiting</span>
      </div>
      <CardContent className="p-0">
        {group.items.map((item) => (
          <ReviewItem key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function ReviewPage() {
  const { data, isLoading } = useReviewQueue();
  const groups = data?.groups ?? [];
  const count = data?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <Inbox className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Review Queue</h1>
          <p className="text-sm text-slate-500">
            {count > 0
              ? `${count} agent-generated question${count === 1 ? '' : 's'} waiting for review. Approve to go live.`
              : 'Agent-generated questions awaiting review.'}
          </p>
        </div>
      </div>

      <AgentNav />

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading review queue…
        </div>
      ) : groups.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Check className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-slate-700">All caught up</p>
            <p className="text-sm text-slate-400">No agent questions waiting for review right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Group key={`${g.source}-${g.topic}`} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
