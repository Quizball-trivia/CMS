'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Home,
  Lightbulb,
  ListOrdered,
  Loader2,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import { useCategories, useDailyChallenges, useUpdateDailyChallenge } from '@/hooks';
import type {
  AdminDailyChallengeConfig,
  Category,
  CluesSettings,
  CountdownSettings,
  DailyChallengeSettings,
  DailyChallengeType,
  FootballJeopardySettings,
  MoneyDropSettings,
  PutInOrderSettings,
} from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type EditableConfig = AdminDailyChallengeConfig;

const ICONS = {
  moneyDrop: DollarSign,
  footballJeopardy: Brain,
  clues: Lightbulb,
  countdown: Timer,
  putInOrder: ListOrdered,
} satisfies Record<DailyChallengeType, React.ComponentType<{ className?: string }>>;

function toMoneyDropSettings(settings: DailyChallengeSettings): MoneyDropSettings {
  return {
    categoryIds: 'categoryIds' in settings ? settings.categoryIds : [],
    questionCount: 'questionCount' in settings ? settings.questionCount : 5,
    secondsPerQuestion: 'secondsPerQuestion' in settings ? settings.secondsPerQuestion : 30,
    startingMoney: 'startingMoney' in settings ? settings.startingMoney : 100000,
  };
}

function toFootballJeopardySettings(settings: DailyChallengeSettings): FootballJeopardySettings {
  return {
    categoryIds: 'categoryIds' in settings ? settings.categoryIds.slice(0, 3) : [],
    pickCount: 'pickCount' in settings ? settings.pickCount : 9,
  };
}

function toCountdownSettings(settings: DailyChallengeSettings): CountdownSettings {
  return {
    categoryIds: 'categoryIds' in settings ? settings.categoryIds : [],
    roundCount: 'roundCount' in settings ? settings.roundCount : 3,
    secondsPerRound: 'secondsPerRound' in settings ? settings.secondsPerRound : 45,
  };
}

function toCluesSettings(settings: DailyChallengeSettings): CluesSettings {
  return {
    categoryIds: 'categoryIds' in settings ? settings.categoryIds : [],
    questionCount: 'questionCount' in settings ? settings.questionCount : 5,
    secondsPerClueStep: 'secondsPerClueStep' in settings ? settings.secondsPerClueStep : 8,
  };
}

function toPutInOrderSettings(settings: DailyChallengeSettings): PutInOrderSettings {
  return {
    categoryIds: 'categoryIds' in settings ? settings.categoryIds : [],
    roundCount: 'roundCount' in settings ? settings.roundCount : 4,
    itemsPerRound: 'itemsPerRound' in settings ? settings.itemsPerRound : 4,
  };
}

function updateCategoryIds(
  categoryIds: string[],
  categoryId: string,
  checked: boolean,
  maxCount?: number
) {
  const next = checked
    ? [...new Set([...categoryIds, categoryId])]
    : categoryIds.filter((id) => id !== categoryId);
  return typeof maxCount === 'number' ? next.slice(0, maxCount) : next;
}

function getCategoryName(category: Category) {
  return category.name.en || category.slug || 'Category';
}

function CategorySelector({
  categories,
  selectedCategoryIds,
  onToggle,
  maxCount,
}: {
  categories: Category[];
  selectedCategoryIds: string[];
  onToggle: (categoryId: string, checked: boolean) => void;
  maxCount?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Content Source Pool</p>
        <Badge
          variant="outline"
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-black',
            selectedCategoryIds.length > 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-500'
          )}
        >
          {selectedCategoryIds.length} {typeof maxCount === 'number' ? `/ ${maxCount}` : ''} Selected
        </Badge>
      </div>
      <div className="max-h-[22rem] overflow-y-auto pr-1">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const checked = selectedCategoryIds.includes(category.id);
            const disabled = !checked && maxCount !== undefined && selectedCategoryIds.length >= maxCount;
            return (
              <label
                key={category.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-all cursor-pointer',
                  checked
                    ? 'border-slate-900 bg-slate-950 text-white shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                  disabled && 'opacity-30 cursor-not-allowed'
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(value) => onToggle(category.id, value === true)}
                  className={cn(checked && "border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-black")}
                />
                <div className="min-w-0 flex flex-col">
                  <span className="truncate text-xs font-bold leading-tight">{getCategoryName(category)}</span>
                  <span className={cn("truncate text-[9px] leading-tight", checked ? "text-white/60" : "text-slate-400")}>{category.slug}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingsEditor({
  config,
  categories,
  onChange,
}: {
  config: EditableConfig;
  categories: Category[];
  onChange: (config: EditableConfig) => void;
}) {
  if (config.challengeType === 'moneyDrop') {
    const settings = toMoneyDropSettings(config.settings);
    return (
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Gameplay Logic</p>
          <div className="grid gap-3">
            <FieldNumber
              label="Question Count"
              value={settings.questionCount}
              onChange={(value) => onChange({ ...config, settings: { ...settings, questionCount: value } })}
            />
            <FieldNumber
              label="Seconds Per Question"
              value={settings.secondsPerQuestion}
              onChange={(value) => onChange({ ...config, settings: { ...settings, secondsPerQuestion: value } })}
            />
            <FieldNumber
              label="Starting Money"
              value={settings.startingMoney}
              onChange={(value) => onChange({ ...config, settings: { ...settings, startingMoney: value } })}
            />
          </div>
        </div>
        <CategorySelector
          categories={categories}
          selectedCategoryIds={settings.categoryIds}
          onToggle={(categoryId, checked) =>
            onChange({
              ...config,
              settings: {
                ...settings,
                categoryIds: updateCategoryIds(settings.categoryIds, categoryId, checked),
              },
            })}
        />
      </div>
    );
  }

  if (config.challengeType === 'footballJeopardy') {
    const settings = toFootballJeopardySettings(config.settings);
    const remaining = Math.max(0, 3 - settings.categoryIds.length);
    return (
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Gameplay Logic</p>
          <div className="space-y-3">
            <FieldNumber
              label="Pick Count"
              value={settings.pickCount}
              onChange={(value) => onChange({ ...config, settings: { ...settings, pickCount: value } })}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Rules</p>
              <p className="text-xs font-semibold leading-relaxed text-slate-600">
                Pick exactly 3 categories. Each must have easy, medium, and hard questions.
              </p>
              <div className={cn(
                "mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black border",
                remaining === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
              )}>
                {settings.categoryIds.length}/3 SELECTED
              </div>
            </div>
          </div>
        </div>
        <CategorySelector
          categories={categories}
          selectedCategoryIds={settings.categoryIds}
          maxCount={3}
          onToggle={(categoryId, checked) =>
            onChange({
              ...config,
              settings: {
                ...settings,
                categoryIds: updateCategoryIds(settings.categoryIds, categoryId, checked, 3),
              },
            })}
        />
      </div>
    );
  }

  if (config.challengeType === 'countdown') {
    const settings = toCountdownSettings(config.settings);
    return (
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Gameplay Logic</p>
          <div className="grid gap-3">
            <FieldNumber
              label="Round Count"
              value={settings.roundCount}
              onChange={(value) => onChange({ ...config, settings: { ...settings, roundCount: value } })}
            />
            <FieldNumber
              label="Seconds Per Round"
              value={settings.secondsPerRound}
              onChange={(value) => onChange({ ...config, settings: { ...settings, secondsPerRound: value } })}
            />
          </div>
        </div>
        <CategorySelector
          categories={categories}
          selectedCategoryIds={settings.categoryIds}
          onToggle={(categoryId, checked) =>
            onChange({
              ...config,
              settings: {
                ...settings,
                categoryIds: updateCategoryIds(settings.categoryIds, categoryId, checked),
              },
            })}
        />
      </div>
    );
  }

  if (config.challengeType === 'clues') {
    const settings = toCluesSettings(config.settings);
    return (
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Gameplay Logic</p>
          <div className="grid gap-3">
            <FieldNumber
              label="Question Count"
              value={settings.questionCount}
              onChange={(value) => onChange({ ...config, settings: { ...settings, questionCount: value } })}
            />
            <FieldNumber
              label="Seconds Per Clue Step"
              value={settings.secondsPerClueStep}
              onChange={(value) => onChange({ ...config, settings: { ...settings, secondsPerClueStep: value } })}
            />
          </div>
        </div>
        <CategorySelector
          categories={categories}
          selectedCategoryIds={settings.categoryIds}
          onToggle={(categoryId, checked) =>
            onChange({
              ...config,
              settings: {
                ...settings,
                categoryIds: updateCategoryIds(settings.categoryIds, categoryId, checked),
              },
            })}
        />
      </div>
    );
  }

  const settings = toPutInOrderSettings(config.settings);
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Gameplay Logic</p>
        <div className="grid gap-3">
          <FieldNumber
            label="Round Count"
            value={settings.roundCount}
            onChange={(value) => onChange({ ...config, settings: { ...settings, roundCount: value } })}
          />
          <FieldNumber
            label="Items Per Round"
            value={settings.itemsPerRound}
            onChange={(value) => onChange({ ...config, settings: { ...settings, itemsPerRound: value } })}
          />
        </div>
      </div>
      <CategorySelector
        categories={categories}
        selectedCategoryIds={settings.categoryIds}
        onToggle={(categoryId, checked) =>
          onChange({
            ...config,
            settings: {
              ...settings,
              categoryIds: updateCategoryIds(settings.categoryIds, categoryId, checked),
            },
          })}
      />
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 px-3">
      <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</Label>
      <Input
        type="number"
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 w-24 rounded-lg border-slate-200 bg-white px-2 text-right text-xs font-bold"
      />
    </div>
  );
}

function getSelectedCategoryCount(config: EditableConfig): number {
  return 'categoryIds' in config.settings ? config.settings.categoryIds.length : 0;
}

function isConfigDirty(config: EditableConfig, original?: EditableConfig): boolean {
  if (!original) return false;
  return JSON.stringify(config) !== JSON.stringify(original);
}

function validateConfig(config: EditableConfig): string | null {
  if (!config.isActive) {
    return null;
  }

  if (config.challengeType === 'footballJeopardy') {
    const settings = toFootballJeopardySettings(config.settings);
    if (settings.categoryIds.length !== 3) {
      return 'Football Jeopardy requires exactly 3 categories.';
    }
  } else if ('categoryIds' in config.settings && config.settings.categoryIds.length === 0) {
    return 'Select at least one category.';
  }

  return null;
}

export default function DailyChallengesPage() {
  const { data: configs, isLoading, isError } = useDailyChallenges();
  const { data: categories = [] } = useCategories({ is_active: 'true', limit: 100 });
  const updateMutation = useUpdateDailyChallenge();
  const [drafts, setDrafts] = useState<Record<DailyChallengeType, EditableConfig>>({} as Record<DailyChallengeType, EditableConfig>);
  const [expandedTypes, setExpandedTypes] = useState<Set<DailyChallengeType>>(new Set());
  const [savingType, setSavingType] = useState<DailyChallengeType | null>(null);

  const originalConfigMap = useMemo(() => {
    return new Map((configs ?? []).map((config) => [config.challengeType, config]));
  }, [configs]);

  useEffect(() => {
    if (!configs) return;
    setDrafts(
      configs.reduce<Record<DailyChallengeType, EditableConfig>>((acc, config) => {
        acc[config.challengeType] = config;
        return acc;
      }, {} as Record<DailyChallengeType, EditableConfig>)
    );
  }, [configs]);

  const orderedConfigs = useMemo(() => {
    const items = Object.values(drafts);
    return items.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }, [drafts]);

  const dashboardStats = useMemo(() => {
    const items = Object.values(drafts);
    const activeCount = items.filter((item) => item.isActive).length;
    const homeCount = items.filter((item) => item.isActive && item.showOnHome).length;
    const invalidCount = items.filter((item) => validateConfig(item) !== null).length;
    const dirtyCount = items.filter((item) => isConfigDirty(item, originalConfigMap.get(item.challengeType))).length;

    return { total: items.length, activeCount, homeCount, invalidCount, dirtyCount };
  }, [drafts, originalConfigMap]);

  const handleDraftChange = (config: EditableConfig) => {
    setDrafts((current) => ({ ...current, [config.challengeType]: config }));
  };

  const toggleExpand = (type: DailyChallengeType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSave = async (config: EditableConfig) => {
    const validationError = validateConfig(config);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSavingType(config.challengeType);
    try {
      await updateMutation.mutateAsync({
        challengeType: config.challengeType,
        data: {
          isActive: config.isActive,
          sortOrder: config.sortOrder,
          showOnHome: config.showOnHome,
          coinReward: config.coinReward,
          xpReward: config.xpReward,
          settings: config.settings,
        },
      });
      toast.success(`${config.title} updated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update daily challenge';
      toast.error(message);
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] py-8 text-foreground selection:bg-slate-900 selection:text-white">
      <div className="mx-auto max-w-[1300px] px-6 space-y-8">
        <header className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between px-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950">Daily Challenges</h1>
                <p className="text-sm font-semibold text-slate-500">Global configuration and live status</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <SummaryTile label="Configured" value={dashboardStats.total} tone="slate" icon={Sparkles} />
            <SummaryTile label="Active" value={dashboardStats.activeCount} tone="emerald" icon={Zap} />
            <SummaryTile label="Home" value={dashboardStats.homeCount} tone="blue" icon={Home} />
            {(dashboardStats.invalidCount > 0 || dashboardStats.dirtyCount > 0) && (
              <SummaryTile label="Needs Save" value={dashboardStats.invalidCount || dashboardStats.dirtyCount} tone="amber" icon={AlertCircle} />
            )}
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-slate-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading daily challenge configs...
          </div>
        ) : null}

        {isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 text-sm font-medium text-rose-700">
            Failed to load daily challenge configs.
          </div>
        ) : null}

        <div className="grid gap-6">
          {orderedConfigs.map((config) => {
            const Icon = ICONS[config.challengeType];
            const validationError = validateConfig(config);
            const original = originalConfigMap.get(config.challengeType);
            const isDirty = isConfigDirty(config, original);
            const isExpanded = expandedTypes.has(config.challengeType);
            const isSaving = savingType === config.challengeType;
            
            return (
              <Card key={config.challengeType} className="overflow-hidden rounded-[24px] border-slate-200/80 bg-white shadow-sm transition-all hover:shadow-md">
                <div className="px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <button 
                        onClick={() => toggleExpand(config.challengeType)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-900 transition-colors hover:bg-slate-200"
                      >
                        <Icon className="h-6 w-6" />
                      </button>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 
                            className="text-lg font-black tracking-tight text-slate-900 cursor-pointer hover:underline"
                            onClick={() => toggleExpand(config.challengeType)}
                          >
                            {config.title}
                          </h3>
                          {config.isActive ? (
                            <StatusPill tone="emerald" icon={CheckCircle2}>ACTIVE</StatusPill>
                          ) : (
                            <StatusPill tone="slate" icon={AlertCircle}>INACTIVE</StatusPill>
                          )}
                          {config.showOnHome && (
                            <StatusPill tone="blue" icon={Home}>HOME</StatusPill>
                          )}
                          {isDirty && (
                            <StatusPill tone="amber" icon={Sparkles}>UNSAVED</StatusPill>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-500 line-clamp-1">{config.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 lg:gap-8">
                       <div className="flex items-center gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order</Label>
                          <Input
                            type="number"
                            value={String(config.sortOrder)}
                            onChange={(event) => handleDraftChange({ ...config, sortOrder: Number(event.target.value) })}
                            className="h-8 w-16 border-slate-200 bg-slate-50/50 text-xs font-bold text-center"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Coins</Label>
                          <Input
                            type="number"
                            value={String(config.coinReward)}
                            onChange={(event) => handleDraftChange({ ...config, coinReward: Number(event.target.value) })}
                            className="h-8 w-20 border-slate-200 bg-slate-50/50 text-xs font-bold text-center"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">XP</Label>
                          <Input
                            type="number"
                            value={String(config.xpReward)}
                            onChange={(event) => handleDraftChange({ ...config, xpReward: Number(event.target.value) })}
                            className="h-8 w-20 border-slate-200 bg-slate-50/50 text-xs font-bold text-center"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 border-l border-slate-100 pl-6 lg:pl-8">
                        <div className="flex flex-col gap-1.5">
                           <CheckboxRow 
                            label="Active" 
                            checked={config.isActive} 
                            onCheckedChange={(checked) => handleDraftChange({ ...config, isActive: checked })} 
                          />
                           <CheckboxRow 
                            label="Show Home" 
                            checked={config.showOnHome} 
                            onCheckedChange={(checked) => handleDraftChange({ ...config, showOnHome: checked })} 
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSave(config)}
                            disabled={isSaving || validationError !== null || !isDirty}
                            className={cn(
                              "rounded-xl px-5 h-9 font-black transition-all",
                              isDirty 
                                ? "bg-slate-950 hover:bg-slate-800 text-white shadow-sm" 
                                : "bg-slate-100 text-slate-400 hover:bg-slate-100"
                            )}
                          >
                            {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                            {isDirty ? 'SAVE' : 'SAVED'}
                          </Button>
                          <button 
                            onClick={() => toggleExpand(config.challengeType)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                          >
                            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-6 border-t border-slate-100 pt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                      <SettingsEditor
                        config={config}
                        categories={categories}
                        onChange={handleDraftChange}
                      />
                    </div>
                  )}

                  {validationError && (
                    <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {validationError}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'blue' | 'amber';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-900',
    emerald: 'border-emerald-100 bg-white text-emerald-700',
    blue: 'border-sky-100 bg-white text-sky-700',
    amber: 'border-amber-100 bg-white text-amber-700',
  } as const;

  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-sm', tones[tone])}>
      <div className={cn(
        "flex h-8 w-8 items-center justify-center rounded-xl",
        tone === 'slate' && "bg-slate-100 text-slate-600",
        tone === 'emerald' && "bg-emerald-50 text-emerald-600",
        tone === 'blue' && "bg-sky-50 text-sky-600",
        tone === 'amber' && "bg-amber-50 text-amber-600",
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider opacity-60 leading-none mb-1">{label}</p>
        <p className="text-lg font-black leading-none">{value}</p>
      </div>
    </div>
  );
}

function StatusPill({
  children,
  tone,
  icon: Icon,
}: {
  children: React.ReactNode;
  tone: 'slate' | 'emerald' | 'blue' | 'amber';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  } as const;

  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-black tracking-tight', tones[tone])}>
      <Icon className="h-3 w-3" />
      {children}
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <Checkbox 
        checked={checked} 
        onCheckedChange={(value) => onCheckedChange(value === true)} 
        className="h-3.5 w-3.5 rounded border-slate-300 data-[state=checked]:bg-slate-900"
      />
      <span className="text-[10px] font-black uppercase tracking-tight text-slate-500 group-hover:text-slate-900 transition-colors">{label}</span>
    </label>
  );
}
