'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Archive, CheckCircle2, RotateCcw, Save, Send, XCircle } from 'lucide-react';
import { useUpdateAuctionCard, useUpdateAuctionCardStatus } from '@/hooks';
import { getErrorFeedback } from '@/lib/error-feedback';
import { cn } from '@/lib/utils';
import { ErrorFeedbackDialog } from '@/components/error-feedback-dialog';
import { useErrorFeedbackDialog } from '@/hooks/use-error-feedback-dialog';
import type {
  AuctionCardDetail,
  AuctionCardStatus,
  AuctionCardType,
  AuctionDifficulty,
  AuctionValueType,
  AuctionVerificationStatus,
  UpdateAuctionCardRequest,
} from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const AUCTION_MIN_STARTING_PRICE_EUR = 20_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALUE_TYPE_OPTIONS: Array<{ value: AuctionValueType; label: string }> = [
  { value: 'current', label: 'Current' },
  { value: 'peak', label: 'Peak' },
  { value: 'synthetic', label: 'Synthetic' },
];

const CARD_TYPE_OPTIONS: Array<{ value: AuctionCardType; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'safe_star', label: 'Safe Star' },
  { value: 'bargain', label: 'Bargain' },
  { value: 'trap', label: 'Trap' },
  { value: 'obscure_gem', label: 'Obscure Gem' },
  { value: 'lookalike_story', label: 'Lookalike Story' },
  { value: 'legend', label: 'Legend' },
];

const DIFFICULTY_OPTIONS: Array<{ value: AuctionDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
];


type EditableClue = {
  clue_order: number;
  clue_en: string;
  clue_ka: string;
  clue_kind: string;
  supported_fact_ids_text: string;
};

type FormState = {
  true_value_eur: string;
  starting_price_eur: string;
  value_type: AuctionValueType;
  card_type: AuctionCardType;
  difficulty: AuctionDifficulty;
  verification_status: AuctionVerificationStatus;
  verification_notes: string;
  editor_notes: string;
  clues: EditableClue[];
};

function formatMoney(value: number | null): string {
  if (value === null) return '-';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `€${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `€${Math.round(value / 1_000)}K`;
  }
  return `€${value}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toInitialForm(card: AuctionCardDetail): FormState {
  const clues = [1, 2, 3].map((order) => {
    const clue = card.clues.find((item) => item.clue_order === order);
    return {
      clue_order: order,
      clue_en: clue?.clue_en ?? '',
      clue_ka: clue?.clue_ka ?? '',
      clue_kind: clue?.clue_kind ?? 'fact',
      supported_fact_ids_text: clue?.supported_fact_ids.join(', ') ?? '',
    };
  });

  return {
    true_value_eur: String(card.true_value_eur),
    starting_price_eur: String(card.starting_price_eur),
    value_type: card.value_type,
    card_type: card.card_type,
    difficulty: card.difficulty,
    verification_status: card.verification_status,
    verification_notes: card.verification_notes ?? '',
    editor_notes: card.editor_notes ?? '',
    clues,
  };
}

function parseInteger(value: string): number {
  return Number.parseInt(value.replace(/[,_\s]/g, ''), 10);
}

function parseSupportedFactIds(value: string): { ids: string[]; invalid: string[] } {
  const ids = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const uniqueIds = [...new Set(ids)];
  return {
    ids: uniqueIds,
    invalid: uniqueIds.filter((id) => !UUID_PATTERN.test(id)),
  };
}

function buildSavePayload(form: FormState): { payload: UpdateAuctionCardRequest; errors: string[] } {
  const errors: string[] = [];
  const trueValue = parseInteger(form.true_value_eur);
  const startingPrice = parseInteger(form.starting_price_eur);

  if (!Number.isFinite(trueValue) || trueValue <= 0) {
    errors.push('True value must be greater than 0.');
  }

  if (!Number.isFinite(startingPrice) || startingPrice < AUCTION_MIN_STARTING_PRICE_EUR) {
    errors.push('Starting price must be at least 20000000.');
  }

  if (form.clues.length !== 3) {
    errors.push('Auction cards must have exactly 3 clues.');
  }

  const orders = form.clues.map((clue) => clue.clue_order).sort((a, b) => a - b);
  if (orders[0] !== 1 || orders[1] !== 2 || orders[2] !== 3) {
    errors.push('Clue orders must be exactly 1, 2, and 3.');
  }

  const clues = form.clues.map((clue) => {
    const factIds = parseSupportedFactIds(clue.supported_fact_ids_text);
    if (factIds.invalid.length > 0) {
      errors.push(`Clue ${clue.clue_order} has invalid supported fact IDs: ${factIds.invalid.join(', ')}`);
    }
    if (!clue.clue_en.trim()) {
      errors.push(`English clue is required for clue ${clue.clue_order}.`);
    }
    if (!clue.clue_ka.trim()) {
      errors.push(`Georgian clue is required for clue ${clue.clue_order}.`);
    }
    if (!clue.clue_kind.trim()) {
      errors.push(`Clue kind is required for clue ${clue.clue_order}.`);
    }

    return {
      clue_order: clue.clue_order,
      clue_en: clue.clue_en.trim(),
      clue_ka: clue.clue_ka.trim(),
      clue_kind: clue.clue_kind.trim(),
      supported_fact_ids: factIds.ids,
    };
  });

  return {
    errors,
    payload: {
      true_value_eur: trueValue,
      starting_price_eur: startingPrice,
      value_type: form.value_type,
      card_type: form.card_type,
      difficulty: form.difficulty,
      verification_status: form.verification_status,
      verification_notes: form.verification_notes.trim() || null,
      editor_notes: form.editor_notes.trim() || null,
      clues,
    },
  };
}

function getPublishErrors(form: FormState): string[] {
  const { errors } = buildSavePayload(form);
  return [...errors];
}

function statusClass(status: AuctionCardStatus): string {
  switch (status) {
    case 'published':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'needs_review':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'rejected':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    case 'archived':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    case 'draft':
    default:
      return 'bg-blue-50 text-blue-700 border-blue-100';
  }
}

interface AuctionCardEditorProps {
  card: AuctionCardDetail;
  variant?: 'page' | 'modal';
}

export function AuctionCardEditor({ card, variant = 'page' }: AuctionCardEditorProps) {
  const updateCard = useUpdateAuctionCard();
  const updateStatus = useUpdateAuctionCardStatus();
  const { errorFeedback, showErrorFeedback, closeErrorFeedback } = useErrorFeedbackDialog();
  const [form, setForm] = useState<FormState>(() => toInitialForm(card));
  const [clientErrors, setClientErrors] = useState<string[]>([]);

  const publishErrors = useMemo(() => getPublishErrors(form), [form]);
  const forcePublishErrors = publishErrors.filter((error) => error !== 'Verification must be passed before normal publish.');
  const isBusy = updateCard.isPending || updateStatus.isPending;
  const isModal = variant === 'modal';
  const panelClassName = cn(
    'space-y-4 rounded-3xl bg-white p-6 shadow-sm',
    isModal && 'rounded-2xl border border-slate-200 p-4 shadow-none'
  );
  const widePanelClassName = cn(
    'space-y-5 rounded-3xl bg-white p-6 shadow-sm',
    isModal && 'rounded-2xl border border-slate-200 p-4 shadow-none'
  );

  const updateClue = (order: number, updater: (clue: EditableClue) => EditableClue) => {
    setForm((current) => ({
      ...current,
      clues: current.clues.map((clue) => (clue.clue_order === order ? updater(clue) : clue)),
    }));
  };

  const handleSave = async () => {
    const { payload, errors } = buildSavePayload(form);
    if (errors.length > 0) {
      setClientErrors(errors);
      toast.error('Fix validation errors before saving.');
      return;
    }

    setClientErrors([]);
    try {
      const updatedCard = await updateCard.mutateAsync({ id: card.id, data: payload });
      setForm(toInitialForm(updatedCard));
      toast.success('Auction card saved');
    } catch (error) {
      const feedback = getErrorFeedback(error, 'Failed to save auction card');
      setClientErrors(feedback.description ? [feedback.description] : []);
      showErrorFeedback(error, {
        fallbackTitle: 'Failed to save auction card',
        logModule: 'auction',
        logMessage: 'Failed to save auction card from CMS',
        logData: { auctionCardId: card.id },
      });
    }
  };

  const handleStatus = async (status: AuctionCardStatus, force = false) => {
    if (status === 'published') {
      const errors = force ? forcePublishErrors : publishErrors;
      if (errors.length > 0) {
        setClientErrors(errors);
        toast.error(force ? 'Card is not force-publishable.' : 'Card is not publishable.');
        return;
      }
    }

    setClientErrors([]);
    try {
      const updatedCard = await updateStatus.mutateAsync({ id: card.id, data: { status, force } });
      setForm(toInitialForm(updatedCard));
      toast.success(force ? 'Auction card force published' : `Auction card moved to ${formatLabel(status)}`);
    } catch (error) {
      const feedback = getErrorFeedback(error, 'Failed to update auction card status');
      setClientErrors(feedback.description ? [feedback.description] : []);
      showErrorFeedback(error, {
        fallbackTitle: 'Failed to update auction card status',
        logModule: 'auction',
        logMessage: 'Failed to update auction card status from CMS',
        logData: { auctionCardId: card.id, nextStatus: status, force },
      });
    }
  };

  return (
    <>
      <ErrorFeedbackDialog feedback={errorFeedback} onOpenChange={(open) => {
        if (!open) closeErrorFeedback();
      }} />

      <div className={cn('space-y-6', isModal && 'space-y-4')}>
        <div className={cn('grid gap-6 xl:grid-cols-[320px,1fr]', isModal && 'gap-4')}>
          <section className={panelClassName}>
            <div className="flex items-start gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-xl font-black text-slate-400">
                {card.player.image_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.player.image_url}
                      alt={card.player.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </>
                ) : (
                  card.player.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <div>
                  <h2 className="truncate text-xl font-black text-gray-900">{card.player.name}</h2>
                  <p className="text-sm font-medium text-gray-500">{card.player.current_club ?? 'No current club'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-md font-bold">{card.position_group}</Badge>
                  {card.player.fame_bucket && (
                    <Badge variant="outline" className="rounded-md font-bold">{formatLabel(card.player.fame_bucket)}</Badge>
                  )}
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nationality</dt>
                <dd className="font-semibold text-gray-800">{card.player.nationality ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Current Value</dt>
                <dd className="font-semibold text-gray-800">{formatMoney(card.player.current_value_eur)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Peak Value</dt>
                <dd className="font-semibold text-gray-800">{formatMoney(card.player.peak_value_eur)}</dd>
              </div>
            </dl>
          </section>

          <section className={panelClassName}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('rounded-md font-bold', statusClass(card.status))}>
                    {formatLabel(card.status)}
                  </Badge>
                </div>
                <p className="text-xs font-medium text-gray-400">
                  Created {formatDateTime(card.created_at)} · Updated {formatDateTime(card.updated_at)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isBusy}
                  className="rounded-xl bg-gray-900 font-bold text-white hover:bg-gray-800"
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  type="button"
                  onClick={() => handleStatus('published')}
                  disabled={isBusy || card.status === 'published' || publishErrors.length > 0}
                  className="rounded-xl font-bold"
                >
                  <Send className="h-4 w-4" />
                  Publish
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleStatus('published', true)}
                  disabled={isBusy || card.status === 'published' || forcePublishErrors.length > 0}
                  className="rounded-xl border-amber-200 font-bold text-amber-700 hover:bg-amber-50"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Force Publish
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleStatus('needs_review')}
                  disabled={isBusy || card.status === 'needs_review'}
                  className="rounded-xl font-bold"
                >
                  <RotateCcw className="h-4 w-4" />
                  Needs Review
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleStatus('draft')}
                  disabled={isBusy || card.status === 'draft'}
                  className="rounded-xl font-bold"
                >
                  Draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleStatus('archived')}
                  disabled={isBusy || card.status === 'archived'}
                  className="rounded-xl font-bold"
                >
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleStatus('rejected')}
                  disabled={isBusy || card.status === 'rejected'}
                  className="rounded-xl font-bold"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>

            {clientErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Validation errors</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-5">
                    {clientErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </section>
        </div>

        <section className={widePanelClassName}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">Card Fields</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="true_value_eur">True value EUR</Label>
              <Input
                id="true_value_eur"
                inputMode="numeric"
                value={form.true_value_eur}
                onChange={(event) => setForm((current) => ({ ...current, true_value_eur: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="starting_price_eur">Starting price EUR</Label>
              <Input
                id="starting_price_eur"
                inputMode="numeric"
                value={form.starting_price_eur}
                onChange={(event) => setForm((current) => ({ ...current, starting_price_eur: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Value type</Label>
              <Select
                value={form.value_type}
                onValueChange={(value) => setForm((current) => ({ ...current, value_type: value as AuctionValueType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALUE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Card type</Label>
              <Select
                value={form.card_type}
                onValueChange={(value) => setForm((current) => ({ ...current, card_type: value as AuctionCardType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select
                value={form.difficulty}
                onValueChange={(value) => setForm((current) => ({ ...current, difficulty: value as AuctionDifficulty }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className={widePanelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">Auction Clues</h2>
              <p className="mt-1 text-xs font-medium text-gray-400">Exactly 3 English and Georgian clues are required.</p>
            </div>
            <Badge variant="outline" className="rounded-md font-bold">{form.clues.length}/3 clues</Badge>
          </div>

          <div className="grid gap-4">
            {form.clues.map((clue) => (
              <div key={clue.clue_order} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                <div className="grid gap-4 lg:grid-cols-[90px,160px,1fr,1fr]">
                  <div className="space-y-2">
                    <Label>Order</Label>
                    <Input value={clue.clue_order} readOnly className="bg-white font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label>Kind</Label>
                    <Input
                      value={clue.clue_kind}
                      onChange={(event) => updateClue(clue.clue_order, (current) => ({ ...current, clue_kind: event.target.value }))}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Clue EN</Label>
                    <Textarea
                      rows={3}
                      value={clue.clue_en}
                      onChange={(event) => updateClue(clue.clue_order, (current) => ({ ...current, clue_en: event.target.value }))}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Clue KA</Label>
                    <Textarea
                      rows={3}
                      value={clue.clue_ka}
                      onChange={(event) => updateClue(clue.clue_order, (current) => ({ ...current, clue_ka: event.target.value }))}
                      className="bg-white"
                    />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label>Supported fact IDs</Label>
                  <Input
                    value={clue.supported_fact_ids_text}
                    onChange={(event) => updateClue(clue.clue_order, (current) => ({ ...current, supported_fact_ids_text: event.target.value }))}
                    placeholder="uuid, uuid"
                    className="bg-white font-mono text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {(card.supported_facts.length > 0 || card.generation_run) && (
          <section className="grid gap-6 xl:grid-cols-2">
            {card.supported_facts.length > 0 && (
              <div className={panelClassName}>
                <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">Supported Facts</h2>
                <div className="space-y-3">
                  {card.supported_facts.map((fact) => (
                    <div key={fact.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-md font-bold">{fact.fact_type}</Badge>
                        <Badge variant="outline" className="rounded-md font-bold">{formatLabel(fact.status)}</Badge>
                        {fact.confidence !== null && (
                          <span className="text-xs font-bold text-gray-400">Confidence {fact.confidence}</span>
                        )}
                      </div>
                      <p className="mt-3 text-sm font-semibold text-gray-900">{fact.fact_text_en}</p>
                      {fact.fact_text_ka && (
                        <p className="mt-1 text-sm text-gray-600">{fact.fact_text_ka}</p>
                      )}
                      <p className="mt-3 break-all font-mono text-[11px] text-gray-400">{fact.id}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {card.generation_run && (
              <div className={panelClassName}>
                <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">Generation Run</h2>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Job</dt>
                    <dd className="font-semibold text-gray-800">{card.generation_run.job_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Model</dt>
                    <dd className="font-semibold text-gray-800">{card.generation_run.model_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Role</dt>
                    <dd className="font-semibold text-gray-800">{formatLabel(card.generation_run.model_role)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status</dt>
                    <dd className="font-semibold text-gray-800">{formatLabel(card.generation_run.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Latency</dt>
                    <dd className="font-semibold text-gray-800">
                      {card.generation_run.latency_ms === null ? '-' : `${card.generation_run.latency_ms}ms`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cost</dt>
                    <dd className="font-semibold text-gray-800">
                      {card.generation_run.cost_estimate === null ? '-' : card.generation_run.cost_estimate}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
