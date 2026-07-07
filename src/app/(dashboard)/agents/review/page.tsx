'use client';

import { useState } from 'react';
import { Inbox, Loader2, Check, X, CalendarClock, Trophy, ChevronDown, ChevronRight, RefreshCw, Pencil, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useReviewQueue, useApproveQuestion, useRejectQuestion, useRegenerateQuestion, useUpdateReviewQuestion } from '@/hooks';
import { getLocalizedTextByLang } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AgentNav } from '../agent-ui';
import { TranslateBackfillDialog } from '@/components/questions/translate-backfill-dialog';
import type { AgentReviewGroup, AgentReviewItem, AgentQuestionPayload, I18nField } from '@/types';

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

// A bilingual line: Georgian primary, English muted underneath.
function Bi({ value, className = '' }: { value: I18nField | undefined; className?: string }) {
  const ka = getLocalizedTextByLang(value, 'ka', '—');
  const en = getLocalizedTextByLang(value, 'en');
  return (
    <span className={`flex min-w-0 flex-col ${className}`}>
      <span className="break-words text-sm text-slate-700">{ka}</span>
      {en && en !== ka ? <span className="break-words text-xs text-slate-400">{en}</span> : null}
    </span>
  );
}

// Renders the type-specific content of a question so an editor can actually read
// and judge it — MCQ options, clue chains, ordered items, answer lists, career paths.
function PayloadView({ type, payload }: { type: string; payload: AgentReviewItem['payload'] }) {
  const p = payload ?? {};

  // mcq_single / true_false — options with the correct one highlighted
  // (image MCQs additionally show the photo the question hinges on)
  if (p.options?.length) {
    return (
      <div className="space-y-2">
        {p.image?.url ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.image.url}
              alt="question image"
              className="max-h-64 rounded-lg border border-slate-200 object-contain"
            />
            {p.image.author || p.image.license ? (
              <p className="mt-0.5 text-[10px] text-slate-400">
                {p.image.author ?? ''} {p.image.license ? `· ${p.image.license}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-1.5 sm:grid-cols-2">
          {p.options.map((o, i) => (
            <div
              key={i}
              className={
                o.is_correct
                  ? 'flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5'
                  : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5'
              }
            >
              {o.is_correct ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}
              <Bi value={o.text} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // clue_chain ("Who am I?") — the answer, then the ordered clues (hardest→easiest)
  if (type === 'clue_chain' && (p.clues?.length || p.display_answer)) {
    return (
      <div className="space-y-2">
        <AnswerPill answer={p.display_answer} accepted={p.accepted_answers} />
        <ol className="space-y-1.5">
          {(p.clues ?? []).map((c, i) => (
            <li key={i} className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
              <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
              <Bi value={c.content} />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // career_path — the answer, then the club sequence
  if (type === 'career_path' && (p.clubs?.length || p.display_answer)) {
    return (
      <div className="space-y-2">
        <AnswerPill answer={p.display_answer} accepted={p.accepted_answers} />
        <div className="flex flex-wrap items-center gap-1.5">
          {(p.clubs ?? []).map((club, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 ? <span className="text-slate-300">→</span> : null}
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1">
                <Bi value={club} />
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // put_in_order — items in their correct order
  if (type === 'put_in_order' && p.items?.length) {
    const items = [...p.items].sort((a, b) => (a.sort_value ?? 0) - (b.sort_value ?? 0));
    return (
      <ol className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">{it.sort_value ?? i + 1}</span>
            <Bi value={it.label} />
          </li>
        ))}
      </ol>
    );
  }

  // countdown_list — the full set of accepted answers
  if (type === 'countdown_list' && p.answer_groups?.length) {
    return (
      <div className="grid gap-1.5 sm:grid-cols-2">
        {p.answer_groups.map((g, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <Bi value={g.display} />
          </div>
        ))}
      </div>
    );
  }

  // high_low — the stat + each matchup, higher value highlighted
  if (type === 'high_low' && p.matchups?.length) {
    return (
      <div className="space-y-1.5">
        {p.stat_label ? (
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Stat: <span className="normal-case tracking-normal text-slate-600">{p.stat_label.en}</span>
          </p>
        ) : null}
        {p.matchups.map((m, i) => {
          const leftWins = (m.left_value ?? 0) > (m.right_value ?? 0);
          return (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
              <span className={leftWins ? 'font-semibold text-emerald-700' : 'text-slate-600'}>
                <Bi value={m.left_name} /> {m.left_value}
              </span>
              <span className="text-xs text-slate-300">vs</span>
              <span className={!leftWins ? 'font-semibold text-emerald-700' : 'text-slate-600'}>
                <Bi value={m.right_name} /> {m.right_value}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return <p className="text-xs text-slate-400">No preview available for this question type.</p>;
}

function AnswerPill({ answer, accepted }: { answer?: I18nField; accepted?: string[] }) {
  const ka = getLocalizedTextByLang(answer, 'ka', '');
  const en = getLocalizedTextByLang(answer, 'en', '');
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Answer</span>
      <div className="text-sm font-semibold text-slate-800">
        {ka || en || '—'}
        {en && en !== ka ? <span className="ml-1 text-xs font-normal text-slate-400">({en})</span> : null}
      </div>
      {accepted?.length ? (
        <div className="mt-0.5 text-[11px] text-slate-400">accepts: {accepted.join(', ')}</div>
      ) : null}
    </div>
  );
}

// Editable bilingual pair — Georgian first (primary), English under it. Each
// row carries a language tag: names look identical in both languages, so
// unlabeled fields read as an accidental duplicate.
function BiEditField({
  value,
  onChange,
  multiline,
}: {
  value: I18nField | undefined;
  onChange: (v: I18nField) => void;
  multiline?: boolean;
}) {
  const v = value ?? { en: '', ka: '' };
  const Field: any = multiline ? Textarea : Input;
  const tag = 'mt-2.5 w-7 shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400';
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-start gap-1.5">
        <span className={tag}>ქარ</span>
        <Field
          value={v.ka ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, ka: e.target.value })}
          placeholder="ქართული — Translate All fills this if left empty"
          className="text-sm"
        />
      </div>
      <div className="flex items-start gap-1.5">
        <span className={tag}>EN</span>
        <Field
          value={v.en ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, en: e.target.value })}
          placeholder="English"
          className="text-xs text-slate-500"
        />
      </div>
    </div>
  );
}

function AcceptedAnswersField({ value, onChange }: { value: string[] | undefined; onChange: (v: string[]) => void }) {
  return (
    <div>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accepted answers (comma-separated)</span>
      <Input
        value={(value ?? []).join(', ')}
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        className="mt-1 text-sm"
      />
    </div>
  );
}

// Type-aware editor mirroring PayloadView — every text leaf becomes editable.
function PayloadEditor({
  type,
  payload,
  onChange,
}: {
  type: string;
  payload: AgentQuestionPayload | null;
  onChange: (p: AgentQuestionPayload) => void;
}) {
  const p = payload ?? {};
  const set = (patch: Partial<AgentQuestionPayload>) => onChange({ ...p, ...patch });

  if (p.options?.length) {
    return (
      <div className="space-y-2">
        {p.options.map((o, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-2 w-16 shrink-0 text-xs font-semibold ${o.is_correct ? 'text-emerald-600' : 'text-slate-400'}`}>
              {o.is_correct ? '✓ correct' : 'wrong'}
            </span>
            <BiEditField
              value={o.text}
              onChange={(text) => set({ options: p.options!.map((x, j) => (j === i ? { ...x, text } : x)) })}
            />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'clue_chain') {
    return (
      <div className="space-y-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Answer</span>
          <BiEditField value={p.display_answer} onChange={(display_answer) => set({ display_answer })} />
        </div>
        <AcceptedAnswersField value={p.accepted_answers} onChange={(accepted_answers) => set({ accepted_answers })} />
        {(p.clues ?? []).map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
            <BiEditField
              multiline
              value={c.content}
              onChange={(content) => set({ clues: p.clues!.map((x, j) => (j === i ? { ...x, content } : x)) })}
            />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'career_path') {
    return (
      <div className="space-y-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Answer</span>
          <BiEditField value={p.display_answer} onChange={(display_answer) => set({ display_answer })} />
        </div>
        <AcceptedAnswersField value={p.accepted_answers} onChange={(accepted_answers) => set({ accepted_answers })} />
        {(p.clubs ?? []).map((club, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
            <BiEditField value={club} onChange={(v) => set({ clubs: p.clubs!.map((x, j) => (j === i ? v : x)) })} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'put_in_order' && p.items?.length) {
    return (
      <div className="space-y-2">
        {[...p.items]
          .map((it, idx) => ({ it, idx }))
          .sort((a, b) => (a.it.sort_value ?? 0) - (b.it.sort_value ?? 0))
          .map(({ it, idx }) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-2 shrink-0 text-xs font-bold text-slate-400">{it.sort_value}</span>
              <BiEditField
                value={it.label}
                onChange={(label) => set({ items: p.items!.map((x, j) => (j === idx ? { ...x, label } : x)) })}
              />
            </div>
          ))}
      </div>
    );
  }

  if (type === 'countdown_list' && p.answer_groups?.length) {
    return (
      <div className="space-y-2">
        {p.answer_groups.map((g, i) => (
          <BiEditField
            key={i}
            value={g.display}
            onChange={(display) => set({ answer_groups: p.answer_groups!.map((x, j) => (j === i ? { ...x, display } : x)) })}
          />
        ))}
      </div>
    );
  }

  if (type === 'high_low' && p.matchups?.length) {
    const setMatchup = (i: number, patch: Record<string, unknown>) =>
      set({ matchups: p.matchups!.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    return (
      <div className="space-y-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stat label</span>
          <BiEditField value={p.stat_label} onChange={(stat_label) => set({ stat_label })} />
        </div>
        {p.matchups.map((m, i) => (
          <div key={i} className="flex items-start gap-2">
            <BiEditField value={m.left_name} onChange={(left_name) => setMatchup(i, { left_name })} />
            <Input
              type="number"
              value={m.left_value ?? 0}
              onChange={(e) => setMatchup(i, { left_value: Number(e.target.value) })}
              className="mt-0 w-24 text-sm"
            />
            <span className="mt-2 text-xs text-slate-400">vs</span>
            <BiEditField value={m.right_name} onChange={(right_name) => setMatchup(i, { right_name })} />
            <Input
              type="number"
              value={m.right_value ?? 0}
              onChange={(e) => setMatchup(i, { right_value: Number(e.target.value) })}
              className="mt-0 w-24 text-sm"
            />
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-xs text-slate-400">No editable fields for this question type.</p>;
}

function ReviewItem({ item }: { item: AgentReviewItem }) {
  const approve = useApproveQuestion();
  const reject = useRejectQuestion();
  const regenerate = useRegenerateQuestion();
  const update = useUpdateReviewQuestion();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<{ prompt: I18nField; payload: AgentQuestionPayload | null } | null>(null);
  const busy = approve.isPending || reject.isPending || regenerate.isPending || update.isPending;

  const startEdit = () => {
    setOpen(true);
    setEdit(structuredClone({ prompt: item.prompt ?? { en: '', ka: '' }, payload: item.payload }));
  };
  const saveEdit = () => {
    if (!edit) return;
    update.mutate(
      { id: item.id, data: { prompt: edit.prompt as { en: string; ka: string }, payload: (edit.payload ?? undefined) as Record<string, unknown> | undefined } },
      {
        onSuccess: () => {
          toast.success('Question updated');
          setEdit(null);
        },
        onError: () => toast.error('Failed to save changes'),
      }
    );
  };

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
  const handleRegenerate = () =>
    regenerate.mutate(item.id, {
      onSuccess: () => toast.success('Regenerating — a fresh question is being generated'),
      onError: () => toast.error('Failed to regenerate'),
    });

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={() => setOpen((v) => !v)} className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-600">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-slate-900">
            {/* EN-only drafts (pre-Translate-All) show English as the title */}
            {getLocalizedTextByLang(item.prompt, 'ka', '') || getLocalizedTextByLang(item.prompt, 'en', '—')}
          </p>
          {getLocalizedTextByLang(item.prompt, 'ka', '') ? (
            <p className="mt-0.5 break-words text-xs text-slate-400">
              {getLocalizedTextByLang(item.prompt, 'en')}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={
                item.difficulty === 'easy'
                  ? 'rounded-full bg-emerald-50 px-2 py-0.5 font-semibold uppercase tracking-wide text-emerald-700'
                  : item.difficulty === 'hard'
                    ? 'rounded-full bg-red-50 px-2 py-0.5 font-semibold uppercase tracking-wide text-red-600'
                    : 'rounded-full bg-amber-50 px-2 py-0.5 font-semibold uppercase tracking-wide text-amber-700'
              }
            >
              {item.difficulty}
            </span>
            {item.feedsChallenges.length > 0 ? (
              <span className="text-slate-500">
                <span className="font-semibold">Feeds:</span> {item.feedsChallenges.join(', ')}
              </span>
            ) : (
              <span
                className="text-amber-600"
                title="No daily challenge that's currently active uses this question type + category. It still goes into the question bank on approval; it'll appear in a daily challenge once one is configured to use it."
              >
                Not used by any active daily challenge
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {edit ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setEdit(null)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={busy} className="bg-slate-900 hover:bg-slate-800">
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={startEdit} disabled={busy} className="text-slate-600 hover:bg-slate-50">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={busy} className="text-slate-600 hover:bg-slate-50">
                {regenerate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Regenerate
              </Button>
              <Button size="sm" variant="outline" onClick={handleReject} disabled={busy} className="text-red-600 hover:bg-red-50">
                <X className="h-4 w-4" /> Reject
              </Button>
              <Button size="sm" onClick={handleApprove} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
              </Button>
            </>
          )}
        </div>
      </div>

      {open && edit ? (
        <div className="space-y-3 bg-slate-50 px-4 py-3 pl-11">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prompt</span>
            <BiEditField multiline value={edit.prompt} onChange={(prompt) => setEdit({ ...edit, prompt })} />
          </div>
          <PayloadEditor type={item.type} payload={edit.payload} onChange={(payload) => setEdit({ ...edit, payload })} />
        </div>
      ) : open ? (
        <div className="space-y-3 bg-slate-50 px-4 py-3 pl-11">
          {/* type-specific content (options / clues / items / …) */}
          <PayloadView type={item.type} payload={item.payload} />

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

// ── Filters ──
// The type filter distinguishes plain MCQ from MCQ-with-image: both publish as
// mcq_single; the image one is recognized by payload.image.
const TYPE_FILTERS: Array<{ key: string; label: string; match: (i: AgentReviewItem) => boolean }> = [
  { key: 'mcq', label: 'MCQ', match: (i) => i.type === 'mcq_single' && !i.payload?.image },
  { key: 'image_mcq', label: 'MCQ + image', match: (i) => i.type === 'mcq_single' && !!i.payload?.image },
  { key: 'true_false', label: 'True/False', match: (i) => i.type === 'true_false' },
  { key: 'clue_chain', label: 'Who am I?', match: (i) => i.type === 'clue_chain' },
  { key: 'put_in_order', label: 'Put in order', match: (i) => i.type === 'put_in_order' },
  { key: 'countdown_list', label: 'Countdown', match: (i) => i.type === 'countdown_list' },
  { key: 'career_path', label: 'Career path', match: (i) => i.type === 'career_path' },
  { key: 'imposter_multi_select', label: "Pick'em", match: (i) => i.type === 'imposter_multi_select' },
  { key: 'high_low', label: 'High Low', match: (i) => i.type === 'high_low' },
];

function FilterPill({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white'
          : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
      }
    >
      {label}
      {typeof count === 'number' ? <span className={active ? 'ml-1.5 text-slate-300' : 'ml-1.5 text-slate-400'}>{count}</span> : null}
    </button>
  );
}

export default function ReviewPage() {
  const { data, isLoading } = useReviewQueue();
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ranked' | 'daily'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const allGroups = data?.groups ?? [];
  const allItems = allGroups.flatMap((g) => g.items);
  const typeMatch = (i: AgentReviewItem) => typeFilter === 'all' || TYPE_FILTERS.find((t) => t.key === typeFilter)?.match(i) === true;

  const groups = allGroups
    .filter((g) => sourceFilter === 'all' || g.source === sourceFilter)
    .map((g) => ({ ...g, items: g.items.filter(typeMatch) }))
    .filter((g) => g.items.length > 0);
  const count = groups.reduce((s, g) => s + g.items.length, 0);

  const sourceCount = (s: string) => allGroups.filter((g) => g.source === s).reduce((n, g) => n + g.items.length, 0);

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

      {/* Translate All — same backfill used for all questions (en set + ka empty
          → Georgian filled). Drafts in this queue are included. */}
      <div className="flex justify-end">
        <TranslateBackfillDialog scope="agents" />
      </div>

      {/* filter bar: source + question type */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Source</span>
          <FilterPill active={sourceFilter === 'all'} label="All" count={allItems.length} onClick={() => setSourceFilter('all')} />
          <FilterPill active={sourceFilter === 'daily'} label="Daily challenge" count={sourceCount('daily')} onClick={() => setSourceFilter('daily')} />
          <FilterPill active={sourceFilter === 'ranked'} label="Ranked" count={sourceCount('ranked')} onClick={() => setSourceFilter('ranked')} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</span>
          <FilterPill active={typeFilter === 'all'} label="All" onClick={() => setTypeFilter('all')} />
          {TYPE_FILTERS.map((t) => {
            const n = allItems.filter(t.match).length;
            if (n === 0) return null; // don't clutter with types not in the queue
            return <FilterPill key={t.key} active={typeFilter === t.key} label={t.label} count={n} onClick={() => setTypeFilter(t.key)} />;
          })}
        </div>
      </div>

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
