'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ImagePlus, Languages, Loader2, Save, Sparkles, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCategories, useSaveImageMcqDrafts } from '@/hooks';
import { questionsService } from '@/services';
import type { GeneratedImageMcqCard, GenerateImageMcqProgressEvent, McqOption } from '@/types';
import { cn } from '@/lib/utils';
import { getErrorFeedback, getErrorLogDetails } from '@/lib/error-feedback';
import { logger } from '@/lib/logger';

type ReviewCard = GeneratedImageMcqCard & {
  selected: boolean;
};

const SIZE_OPTIONS = [
  { label: '4:3 HD - 1440x1080', width: 1440, height: 1080 },
  { label: '4:3 Large - 1920x1440', width: 1920, height: 1440 },
  { label: '16:9 HD - 1920x1080', width: 1920, height: 1080 },
  { label: '4:3 Preview - 1024x768', width: 1024, height: 768 },
];
const QUESTIONS_PER_IMAGE = 6;
const MAX_IMAGES_PER_CATEGORY = 25;

function selectedSizeValue(width: number, height: number): string {
  return `${width}x${height}`;
}

function updateOptionText(options: McqOption[], optionId: string, text: string): McqOption[] {
  return options.map((option) =>
    option.id === optionId
      ? { ...option, text: { ...option.text, en: text } }
      : option
  );
}

function setCorrectOption(options: McqOption[], optionId: string): McqOption[] {
  return options.map((option) => ({
    ...option,
    is_correct: option.id === optionId,
  }));
}

function toGeneratedCard(card: ReviewCard): GeneratedImageMcqCard {
  return {
    id: card.id,
    category_id: card.category_id,
    category_slug: card.category_slug,
    category_name: card.category_name,
    prompt: card.prompt,
    difficulty: card.difficulty,
    options: card.options,
    explanation: card.explanation,
    confidence: card.confidence,
    image: card.image,
  };
}

export function ImageMcqGeneratorDialog() {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [imagesPerCategory, setImagesPerCategory] = useState(1);
  const [imageWidth, setImageWidth] = useState(1440);
  const [imageHeight, setImageHeight] = useState(1080);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerateImageMcqProgressEvent | null>(null);
  const [translateToKa, setTranslateToKa] = useState(true);

  const { data: categories = [], isLoading: categoriesLoading } = useCategories({
    is_active: 'true',
    limit: 100,
  });
  const saveDrafts = useSaveImageMcqDrafts();

  const selectedCount = useMemo(
    () => cards.filter((card) => card.selected).length,
    [cards]
  );
  const targetQuestionCount = imagesPerCategory * QUESTIONS_PER_IMAGE;
  const targetPerDifficulty = imagesPerCategory * 2;
  const progressPercent = generationProgress
    ? Math.min(100, Math.round((generationProgress.completed_images / Math.max(generationProgress.total_images, 1)) * 100))
    : 0;

  const handleSizeChange = (value: string) => {
    const [width, height] = value.split('x').map(Number);
    setImageWidth(width);
    setImageHeight(height);
  };

  const handleImagesPerCategoryChange = (value: string) => {
    const nextValue = Number(value);
    setImagesPerCategory(Math.min(MAX_IMAGES_PER_CATEGORY, Math.max(1, Number.isFinite(nextValue) ? nextValue : 1)));
  };

  const handleGenerate = async () => {
    if (!categoryId) {
      toast.error('Choose a category first.');
      return;
    }

    setIsGenerating(true);
    setCards([]);
    setGenerationProgress({
      type: 'progress',
      stage: 'started',
      message: 'Starting generation...',
      completed_images: 0,
      total_images: imagesPerCategory,
      cards_generated: 0,
      target_cards: targetQuestionCount,
    });

    try {
      const result = await questionsService.generateImageMcqPreviewStream({
        category_ids: [categoryId],
        images_per_category: imagesPerCategory,
        questions_per_image: QUESTIONS_PER_IMAGE,
        image_width: imageWidth,
        image_height: imageHeight,
      }, setGenerationProgress);

      setCards(result.cards.map((card) => ({ ...card, selected: true })));
      if (result.cards.length === 0) {
        toast.warning('No usable image questions were generated for this category.');
      } else {
        toast.success(`Generated ${result.cards.length} review card${result.cards.length === 1 ? '' : 's'}`);
      }
    } catch (error) {
      const feedback = getErrorFeedback(error, 'Image question generation failed.');
      toast.error(feedback.title, {
        description: feedback.description,
      });
      logger.error('questions', 'Failed to generate image MCQ preview', getErrorLogDetails(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDrafts = async () => {
    const accepted = cards.filter((card) => card.selected);
    if (accepted.length === 0) {
      toast.error('No accepted cards selected.');
      return;
    }

    try {
      const result = await saveDrafts.mutateAsync({
        cards: accepted.map(toGeneratedCard),
        translate_to_ka: translateToKa,
      });

      if (result.successful > 0) {
        const failedAcceptedIds = new Set(
          result.errors
            .map((error) => accepted[error.index]?.id)
            .filter((id): id is string => Boolean(id))
        );
        setCards((prev) =>
          prev.filter((card) => !card.selected || failedAcceptedIds.has(card.id))
        );
      }
      if (result.failed === 0) {
        setCards([]);
        setOpen(false);
      }
    } catch {
      // Error toast/logging is handled by useSaveImageMcqDrafts.
    }
  };

  const updateCard = (id: string, patch: Partial<ReviewCard>) => {
    setCards((prev) => prev.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  };

  const rejectCard = (id: string) => {
    setCards((prev) => prev.filter((card) => card.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 rounded-xl font-bold">
          <ImagePlus className="h-4 w-4" />
          Generate Image MCQs
        </Button>
      </DialogTrigger>
      <DialogContent
        className="h-[min(96dvh,980px)] gap-0 overflow-hidden p-0 [&_[data-slot=dialog-close]]:text-white"
        style={{ width: '96vw', maxWidth: '1400px', zIndex: 100 }}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b bg-slate-950 px-5 py-4 pr-12 text-white sm:px-6 sm:py-5">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-emerald-300" />
              Generate Image MCQs
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              Generate football image questions, review every card, reject weak output, and save accepted cards as drafts.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1">
            <aside className="max-h-[36vh] overflow-y-auto border-b bg-slate-50 p-4 sm:p-5 lg:max-h-none lg:min-h-0 lg:border-r lg:border-b-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId} disabled={categoriesLoading || isGenerating}>
                    <SelectTrigger className="h-10 bg-white">
                      <SelectValue placeholder={categoriesLoading ? 'Loading categories...' : 'Choose category'} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name.en || category.slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Images</Label>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_IMAGES_PER_CATEGORY}
                      value={imagesPerCategory}
                      onChange={(event) => handleImagesPerCategoryChange(event.target.value)}
                      disabled={isGenerating}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Questions</Label>
                    <Input
                      value={`${targetQuestionCount} total`}
                      disabled
                      className="bg-white"
                    />
                    <p className="text-xs text-slate-500">
                      {targetPerDifficulty} easy, {targetPerDifficulty} medium, {targetPerDifficulty} hard
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Image Size</Label>
                  <Select
                    value={selectedSizeValue(imageWidth, imageHeight)}
                    onValueChange={handleSizeChange}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="h-10 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((option) => (
                        <SelectItem
                          key={selectedSizeValue(option.width, option.height)}
                          value={selectedSizeValue(option.width, option.height)}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !categoryId}
                  className="h-11 w-full rounded-xl bg-slate-950 font-black text-white hover:bg-slate-800"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate Preview
                </Button>

                {generationProgress && (
                  <div className="rounded-lg border bg-white p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-900">
                        {isGenerating ? 'Generating' : 'Generation'}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {generationProgress.cards_generated}/{generationProgress.target_cards} cards
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {generationProgress.message}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <Badge variant="outline">
                        {generationProgress.completed_images}/{generationProgress.total_images} images
                      </Badge>
                      <Badge variant="outline">
                        {progressPercent}%
                      </Badge>
                    </div>
                  </div>
                )}

                <label className="flex items-start gap-3 rounded-lg border bg-white p-3">
                  <Checkbox
                    checked={translateToKa}
                    onCheckedChange={(checked) => setTranslateToKa(Boolean(checked))}
                    disabled={saveDrafts.isPending}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 text-sm">
                    <span className="flex items-center gap-2 font-bold text-slate-900">
                      <Languages className="h-4 w-4 text-slate-500" />
                      Translate to Georgian
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Saved drafts will be translated in the background.
                    </span>
                  </span>
                </label>

                <Alert className="bg-white">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription className="text-xs leading-5">
                    Rejected cards are never saved. Accepted cards upload their normalized image and become draft questions.
                  </AlertDescription>
                </Alert>
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto bg-white p-3 sm:p-5">
              {cards.length === 0 ? (
                <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-dashed bg-slate-50 sm:min-h-[520px]">
                  <div className="max-w-sm text-center">
                    <ImagePlus className="mx-auto mb-4 h-10 w-10 text-slate-300" />
                    <h3 className="text-lg font-black text-slate-900">No generated cards yet</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Choose a category and generate a preview. You will be able to edit, accept, or reject each card before saving.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-lg border bg-white/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{cards.length} cards</Badge>
                      <Badge className="bg-emerald-600">{selectedCount} accepted</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCards((prev) => prev.map((card) => ({ ...card, selected: true })))}>
                        Select all
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setCards((prev) => prev.map((card) => ({ ...card, selected: false })))}>
                        Clear
                      </Button>
                    </div>
                  </div>

                  {cards.map((card, index) => (
                    <article
                      key={card.id}
                      className={cn(
                        'grid grid-cols-1 overflow-hidden rounded-lg border bg-white shadow-sm 2xl:grid-cols-[440px_minmax(0,1fr)]',
                        card.selected ? 'border-emerald-300' : 'border-slate-200 opacity-75'
                      )}
                    >
                      <div className="bg-[linear-gradient(45deg,#111827_25%,transparent_25%),linear-gradient(-45deg,#111827_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111827_75%),linear-gradient(-45deg,transparent_75%,#111827_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] p-3 sm:p-4">
                        <div className="aspect-[4/3] overflow-hidden rounded-md bg-slate-950">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={card.image.data_url} alt={card.image.title} className="h-full w-full object-contain" />
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-slate-300">
                          <p className="truncate font-semibold text-white">{card.image.title}</p>
                          <p>{card.image.width}x{card.image.height} · {card.image.aspect_ratio}</p>
                          <p className="truncate">{card.image.license || 'license unknown'}</p>
                        </div>
                      </div>

                      <div className="min-w-0 space-y-4 p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Checkbox
                              checked={card.selected}
                              onCheckedChange={(checked) => updateCard(card.id, { selected: Boolean(checked) })}
                            />
                            <Badge variant="outline">#{index + 1}</Badge>
                            <Badge variant="outline">{card.category_name}</Badge>
                            <Badge className="bg-slate-900">{card.difficulty}</Badge>
                            <Badge variant="outline">{Math.round(card.confidence * 100)}%</Badge>
                          </div>
                          <Button variant="ghost" size="icon-sm" onClick={() => rejectCard(card.id)} aria-label="Reject card" className="shrink-0">
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label>Question</Label>
                          <Textarea
                            value={card.prompt.en}
                            onChange={(event) => updateCard(card.id, { prompt: { ...card.prompt, en: event.target.value } })}
                            className="min-h-[72px] resize-y"
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {card.options.map((option) => (
                            <div key={option.id} className={cn('min-w-0 rounded-lg border p-3', option.is_correct && 'border-emerald-300 bg-emerald-50')}>
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <Label className="text-xs font-black uppercase tracking-widest">Option {option.id.toUpperCase()}</Label>
                                <Button
                                  variant={option.is_correct ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => updateCard(card.id, { options: setCorrectOption(card.options, option.id) })}
                                  className="h-7 text-xs"
                                >
                                  Correct
                                </Button>
                              </div>
                              <Textarea
                                value={option.text.en}
                                onChange={(event) => updateCard(card.id, { options: updateOptionText(card.options, option.id, event.target.value) })}
                                className="min-h-[76px] resize-y leading-5"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2">
                          <Label>Explanation</Label>
                          <Textarea
                            value={card.explanation.en}
                            onChange={(event) => updateCard(card.id, { explanation: { ...card.explanation, en: event.target.value } })}
                            className="min-h-[72px] resize-y"
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
            <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Close
            </Button>
            <Button
              onClick={handleSaveDrafts}
              disabled={saveDrafts.isPending || isGenerating || selectedCount === 0}
              className="w-full bg-emerald-600 font-black text-white hover:bg-emerald-700 sm:w-auto"
            >
              {saveDrafts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save {selectedCount} Draft{selectedCount === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
