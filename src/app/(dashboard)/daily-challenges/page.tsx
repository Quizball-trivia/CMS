'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Image as ImageIcon,
  Lightbulb,
  List,
  Route,
  Search,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDailyChallenges, useUpdateDailyChallenge } from '@/hooks';
import type {
  AdminDailyChallengeCategoryOption,
  AdminDailyChallengeConfig,
  DailyChallengeIconToken,
  DailyChallengeType,
  UpdateDailyChallengeConfigRequest,
} from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn, getLocalizedText } from '@/lib/utils';

const ICONS: Record<DailyChallengeIconToken, typeof DollarSign> = {
  dollarSign: DollarSign,
  checkCircle: CheckCircle2,
  lightbulb: Lightbulb,
  timer: Timer,
  list: List,
  users: Users,
  route: Route,
  trendingUp: TrendingUp,
  image: ImageIcon,
};

function cloneConfig(config: AdminDailyChallengeConfig): UpdateDailyChallengeConfigRequest {
  return {
    isActive: config.isActive,
    sortOrder: config.sortOrder,
    showOnHome: config.showOnHome,
    coinReward: config.coinReward,
    xpReward: config.xpReward,
    settings: JSON.parse(JSON.stringify(config.settings)) as UpdateDailyChallengeConfigRequest['settings'],
  };
}

function getChallengeQuestionLabel(type: DailyChallengeType): string {
  switch (type) {
    case 'moneyDrop':
      return 'Multiple Choice';
    case 'trueFalse':
      return 'True / False';
    case 'clues':
      return 'Clue Chain';
    case 'countdown':
      return 'Countdown List';
    case 'putInOrder':
      return 'Put In Order';
    case 'imposter':
      return 'Imposter Multi Select';
    case 'careerPath':
      return 'Career Path';
    case 'highLow':
      return 'High Low';
    case 'footballLogic':
      return 'Football Logic';
  }
}

function updateNumber(
  value: string,
  fallback = 0
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ChallengeCategories({
  categories,
  selectedIds,
  questionTypeLabel,
  onToggle,
  onSelectAll,
  onClear,
}: {
  categories: AdminDailyChallengeCategoryOption[];
  selectedIds: string[];
  questionTypeLabel: string;
  onToggle: (categoryId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredCategories = useMemo(() => {
    const categoriesToShow = normalizedQuery.length === 0
      ? categories
      : categories.filter((category) => {
          const name = getLocalizedText(category.name, category.slug).toLowerCase();
          return name.includes(normalizedQuery) || category.slug.toLowerCase().includes(normalizedQuery);
        });

    return [...categoriesToShow].sort((left, right) => {
      const leftSelected = selectedIdSet.has(left.id) ? 0 : 1;
      const rightSelected = selectedIdSet.has(right.id) ? 0 : 1;
      if (leftSelected !== rightSelected) return leftSelected - rightSelected;
      return right.questionCount - left.questionCount;
    });
  }, [categories, normalizedQuery, selectedIdSet]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search categories..."
            className="h-9 bg-white pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClear} disabled={selectedIds.length === 0}>
            Clear
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSelectAll} disabled={categories.length === selectedIds.length}>
            Select all
          </Button>
        </div>
      </div>

      <div className="mt-3 max-h-64 overflow-y-auto pr-1">
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {filteredCategories.map((category) => {
            const isSelected = selectedIdSet.has(category.id);
            return (
              <label
                key={category.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-xl border bg-white px-3 py-2 transition-colors',
                  isSelected ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onToggle(category.id, checked === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {getLocalizedText(category.name, category.slug)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {category.questionCount} total · E {category.easyCount} · M {category.mediumCount} · H {category.hardCount}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {filteredCategories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            {categories.length === 0
              ? `No categories have published ${questionTypeLabel} questions yet. Upload questions, then publish them from the Questions table.`
              : 'No categories match this search.'}
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Empty selection means the challenge can pull from every category with published content for this question type.
      </p>
    </div>
  );
}

function ChallengeEditor({
  config,
  draft,
  isSaving,
  onDraftChange,
  onSave,
}: {
  config: AdminDailyChallengeConfig;
  draft: UpdateDailyChallengeConfigRequest;
  isSaving: boolean;
  onDraftChange: (updater: (current: UpdateDailyChallengeConfigRequest) => UpdateDailyChallengeConfigRequest) => void;
  onSave: () => void;
}) {
  const Icon = ICONS[config.iconToken];

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <Icon className="h-5 w-5 text-slate-700" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-950">{config.title}</h2>
                <Badge variant="outline" className="border-slate-300 text-slate-600">
                  {config.challengeType}
                </Badge>
                <Badge variant="outline" className="border-slate-300 text-slate-600">
                  {getChallengeQuestionLabel(config.challengeType)}
                </Badge>
              </div>
              <p className="max-w-3xl text-sm text-slate-500">{config.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Checkbox
                checked={draft.isActive}
                onCheckedChange={(checked) => onDraftChange((current) => ({
                  ...current,
                  isActive: checked === true,
                }))}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Checkbox
                checked={draft.showOnHome}
                onCheckedChange={(checked) => onDraftChange((current) => ({
                  ...current,
                  showOnHome: checked === true,
                }))}
              />
              Show on home
            </label>
            <Button onClick={onSave} disabled={isSaving}>
              Save
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <NumberField label="Sort Order" value={draft.sortOrder} onChange={(value) => onDraftChange((current) => ({
            ...current,
            sortOrder: value,
          }))} />
          <NumberField label="Coin Reward" value={draft.coinReward} onChange={(value) => onDraftChange((current) => ({
            ...current,
            coinReward: value,
          }))} />
          <NumberField label="XP Reward" value={draft.xpReward} onChange={(value) => onDraftChange((current) => ({
            ...current,
            xpReward: value,
          }))} />
        </div>

        <SettingsFields draft={draft} onChange={onDraftChange} />

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Question pool categories</Label>
              <p className="mt-1 text-xs text-slate-500">
                Pick categories to restrict which uploaded questions this daily challenge can use.
              </p>
            </div>
            <span className={cn(
              'shrink-0 text-xs font-semibold',
              draft.settings.categoryIds.length > 0 ? 'text-slate-600' : 'text-amber-600'
            )}>
              {draft.settings.categoryIds.length} selected
            </span>
          </div>
          <ChallengeCategories
            categories={config.availableCategories}
            selectedIds={draft.settings.categoryIds}
            questionTypeLabel={getChallengeQuestionLabel(config.challengeType)}
            onSelectAll={() => onDraftChange((current) => ({
              ...current,
              settings: {
                ...current.settings,
                categoryIds: config.availableCategories.map((category) => category.id),
              },
            }))}
            onClear={() => onDraftChange((current) => ({
              ...current,
              settings: {
                ...current.settings,
                categoryIds: [],
              },
            }))}
            onToggle={(categoryId, checked) =>
              onDraftChange((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  categoryIds: checked
                    ? [...current.settings.categoryIds, categoryId]
                    : current.settings.categoryIds.filter((id) => id !== categoryId),
                },
              }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsFields({
  draft,
  onChange,
}: {
  draft: UpdateDailyChallengeConfigRequest;
  onChange: (updater: (current: UpdateDailyChallengeConfigRequest) => UpdateDailyChallengeConfigRequest) => void;
}) {
  switch (draft.settings.challengeType) {
    case 'moneyDrop': {
      const settings = draft.settings;
      return (
        <div className="grid gap-4 md:grid-cols-3">
          <NumberField label="Question Count" value={draft.settings.questionCount} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...settings, questionCount: value },
          }))} />
          <NumberField label="Seconds / Question" value={draft.settings.secondsPerQuestion} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...settings, secondsPerQuestion: value },
          }))} />
          <NumberField label="Starting Money" value={draft.settings.startingMoney} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...settings, startingMoney: value },
          }))} />
        </div>
      );
    }
    case 'trueFalse':
    case 'imposter':
    case 'careerPath':
    case 'footballLogic':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField label="Question Count" value={draft.settings.questionCount} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, questionCount: value },
          }))} />
          <NumberField label="Seconds / Question" value={draft.settings.secondsPerQuestion} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, secondsPerQuestion: value },
          }))} />
        </div>
      );
    case 'countdown':
    case 'highLow':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField label="Round Count" value={draft.settings.roundCount} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, roundCount: value },
          }))} />
          <NumberField label="Seconds / Round" value={draft.settings.secondsPerRound} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, secondsPerRound: value },
          }))} />
        </div>
      );
    case 'clues':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField label="Question Count" value={draft.settings.questionCount} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, questionCount: value },
          }))} />
          <NumberField label="Seconds / Clue Step" value={draft.settings.secondsPerClueStep} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, secondsPerClueStep: value },
          }))} />
        </div>
      );
    case 'putInOrder':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <NumberField label="Round Count" value={draft.settings.roundCount} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, roundCount: value },
          }))} />
          <NumberField label="Items / Round" value={draft.settings.itemsPerRound} onChange={(value) => onChange((current) => ({
            ...current,
            settings: { ...current.settings, itemsPerRound: value },
          }))} />
        </div>
      );
  }
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(updateNumber(event.target.value, value))}
        className="h-10"
      />
    </div>
  );
}

export default function DailyChallengesPage() {
  const { data, isLoading } = useDailyChallenges();
  const updateDailyChallenge = useUpdateDailyChallenge();
  const [drafts, setDrafts] = useState<Partial<Record<DailyChallengeType, UpdateDailyChallengeConfigRequest>>>({});
  const [selectedChallengeType, setSelectedChallengeType] = useState<DailyChallengeType | null>(null);

  useEffect(() => {
    if (!data) return;
    setDrafts((current) => {
      const next: Partial<Record<DailyChallengeType, UpdateDailyChallengeConfigRequest>> = { ...current };
      for (const config of data) {
        next[config.challengeType] ??= cloneConfig(config);
      }
      return next;
    });
    setSelectedChallengeType((current) => current ?? data[0]?.challengeType ?? null);
  }, [data]);

  const orderedChallenges = useMemo(
    () => [...(data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [data]
  );

  const setDraft = (
    challengeType: DailyChallengeType,
    updater: (current: UpdateDailyChallengeConfigRequest) => UpdateDailyChallengeConfigRequest
  ) => {
    setDrafts((current) => {
      const existing = current[challengeType];
      if (!existing) return current;
      return { ...current, [challengeType]: updater(existing) };
    });
  };

  const handleSave = async (config: AdminDailyChallengeConfig) => {
    const draft = drafts[config.challengeType];
    if (!draft) return;

    try {
      await updateDailyChallenge.mutateAsync({
        challengeType: config.challengeType,
        data: draft,
      });
      toast.success(`${config.title} updated`);
    } catch {
      toast.error(`Failed to update ${config.title}`);
    }
  };

  const selectedConfig = useMemo(
    () => orderedChallenges.find((config) => config.challengeType === selectedChallengeType) ?? orderedChallenges[0] ?? null,
    [orderedChallenges, selectedChallengeType]
  );
  const selectedDraft = selectedConfig ? drafts[selectedConfig.challengeType] : undefined;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <CalendarDays className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Daily Challenges</h1>
          <p className="text-sm text-slate-500">Manage the live daily challenge lineup and content pools.</p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-sm text-slate-500">Loading daily challenges…</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-2">
            <div className="space-y-1">
              {orderedChallenges.map((config) => {
                const Icon = ICONS[config.iconToken];
                const draft = drafts[config.challengeType];
                const isSelected = selectedConfig?.challengeType === config.challengeType;
                return (
                  <button
                    key={config.challengeType}
                    type="button"
                    onClick={() => setSelectedChallengeType(config.challengeType)}
                    className={cn(
                      'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-slate-900 bg-slate-950 text-white shadow-sm'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('rounded-xl p-2', isSelected ? 'bg-white/10' : 'bg-slate-100')}>
                        <Icon className={cn('h-4 w-4', isSelected ? 'text-white' : 'text-slate-600')} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-bold">{config.title}</div>
                          <div className={cn('h-2 w-2 rounded-full', draft?.isActive ? 'bg-emerald-500' : 'bg-slate-300')} />
                        </div>
                        <div className={cn('mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]', isSelected ? 'text-slate-300' : 'text-slate-500')}>
                          <span>{getChallengeQuestionLabel(config.challengeType)}</span>
                          <span>·</span>
                          <span>{draft?.settings.categoryIds.length ?? 0} cats</span>
                          <span>·</span>
                          <span>{draft?.coinReward ?? config.coinReward} coins</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedConfig && selectedDraft ? (
          <ChallengeEditor
            config={selectedConfig}
            draft={selectedDraft}
            isSaving={updateDailyChallenge.isPending}
            onDraftChange={(updater) => setDraft(selectedConfig.challengeType, updater)}
            onSave={() => void handleSave(selectedConfig)}
          />
        ) : null}
      </div>
    </div>
  );
}
