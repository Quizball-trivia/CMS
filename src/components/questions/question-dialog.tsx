'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useUpdateQuestionStatus, useUpdateQuestion, useCreateQuestion, useCategories, useCheckDuplicates } from '@/hooks';
import type { Question, QuestionStatus, CreateQuestionRequest, UpdateQuestionRequest } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, EyeOff, Edit, CheckCircle2, ChevronLeft, ChevronRight, Save, X, Loader2 } from 'lucide-react';
import { getLocalizedText } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { TextInputEditor, type AnswerWithId } from './text-input-editor';
import { DifficultySignal, getDifficultyVariant } from '@/components/ui/difficulty-signal';
import { questionToFormData, generateAnswerId } from '@/lib/question-utils';

type DialogMode = 'view' | 'edit' | 'create';

interface QuestionDialogProps {
  mode?: DialogMode;
  question?: Question;
  allQuestions?: Question[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
  totalAvailable?: number;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function QuestionDialog({
  mode: initialMode = 'view',
  question,
  allQuestions = [],
  currentIndex = 0,
  onNavigate,
  totalAvailable = 0,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: QuestionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>(initialMode);
  const [activeIndex, setActiveIndex] = useState(currentIndex);

  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const { data: categories } = useCategories();
  const updateStatus = useUpdateQuestionStatus();
  const updateQuestion = useUpdateQuestion();
  const createQuestion = useCreateQuestion();
  const checkDuplicates = useCheckDuplicates();

  const isSubmitting = createQuestion.isPending || checkDuplicates.isPending;

  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<CreateQuestionRequest | null>(null);
  const [duplicateResults, setDuplicateResults] = useState<
    Array<{ id: string; category_id: string; category_name: Record<string, string>; created_at: string }>
  >([]);

  const totalQuestions = allQuestions.length;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex < totalQuestions - 1;
  const showLoadingIndicator = totalAvailable > totalQuestions;

  // Use the question at activeIndex if we're navigating, otherwise use the prop
  const displayQuestion = allQuestions.length > 0 ? allQuestions[activeIndex] : question;

  // Form state for edit/create mode
  const [formData, setFormData] = useState<{
    category_id: string;
    locale: 'en' | 'ka';
    difficulty: 'easy' | 'medium' | 'hard';
    status: QuestionStatus;
    type: 'mcq_single' | 'input_text';
    prompt: string;
    explanation: string;
    options: Array<{ id?: string; text: string; is_correct: boolean }>;
    acceptedAnswers: AnswerWithId[];
    caseSensitive: boolean;
  }>({
    category_id: '',
    locale: 'en',
    difficulty: 'medium',
    status: 'draft',
    type: 'mcq_single',
    prompt: '',
    explanation: '',
    options: [
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
    acceptedAnswers: [{ id: generateAnswerId(), en: '' }],
    caseSensitive: false,
  });

  // Reset activeIndex when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setActiveIndex(currentIndex);
      setMode(initialMode);

      if (initialMode === 'edit' && displayQuestion) {
        // Load question data into form using utility function
        setFormData(questionToFormData(displayQuestion, 'en'));
      } else if (initialMode === 'create') {
        // Reset form for new question
        setFormData({
          category_id: categories?.[0]?.id || '',
          locale: 'en',
          difficulty: 'medium',
          status: 'draft',
          type: 'mcq_single',
          prompt: '',
          explanation: '',
          options: [
            { text: '', is_correct: false },
            { text: '', is_correct: false },
            { text: '', is_correct: false },
            { text: '', is_correct: false },
          ],
          acceptedAnswers: [{ id: generateAnswerId(), en: '' }],
          caseSensitive: false,
        });
      }
    }
  };

  // Handle navigation
  const handleNavigate = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
    if (onNavigate) {
      onNavigate(newIndex);
    }
  }, [onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || mode !== 'view') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        handleNavigate(activeIndex - 1);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        handleNavigate(activeIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, mode, activeIndex, hasPrevious, hasNext, handleNavigate]);


  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!displayQuestion) return;

    const newStatus: QuestionStatus = displayQuestion.status === 'published' ? 'draft' : 'published';

    try {
      await updateStatus.mutateAsync({ id: displayQuestion.id, data: { status: newStatus } });
      toast.success(`Question ${newStatus === 'published' ? 'published' : 'unpublished'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleEdit = () => {
    if (displayQuestion) {
      // Use current locale from form data, or default to 'en'
      setFormData(questionToFormData(displayQuestion, formData.locale || 'en'));
    }
    setMode('edit');
  };

  const buildCreatePayload = (): CreateQuestionRequest => {
    const locale = formData.locale;

    return {
      category_id: formData.category_id,
      type: formData.type,
      difficulty: formData.difficulty,
      status: formData.status,
      prompt: { [locale]: formData.prompt },
      explanation: formData.explanation ? { [locale]: formData.explanation } : null,
      payload: formData.type === 'mcq_single'
        ? {
            type: 'mcq_single',
            options: formData.options.map(opt => ({
              id: generateAnswerId(),
              text: { [locale]: opt.text },
              is_correct: opt.is_correct,
            })),
          }
        : {
            type: 'input_text',
            accepted_answers: formData.acceptedAnswers
              .filter(a => (a[locale] || '').trim())
              .map(a => ({ [locale]: a[locale] })),
            case_sensitive: formData.caseSensitive,
          },
    };
  };

  const handleSave = async () => {
    // Validation
    if (!formData.prompt.trim()) {
      toast.error('Question prompt is required');
      return;
    }

    if (!formData.category_id) {
      toast.error('Please select a category');
      return;
    }

    // Validate based on question type
    if (formData.type === 'mcq_single') {
      const correctCount = formData.options.filter(o => o.is_correct).length;
      if (correctCount !== 1) {
        toast.error('Please mark exactly one option as correct');
        return;
      }

      const emptyOptions = formData.options.filter(o => !o.text.trim());
      if (emptyOptions.length > 0) {
        toast.error('All options must have text');
        return;
      }
    } else if (formData.type === 'input_text') {
      const validAnswers = formData.acceptedAnswers.filter(a => (a[formData.locale] || '').trim());
      if (validAnswers.length === 0) {
        toast.error('At least one accepted answer is required');
        return;
      }
    }

    try {
      if (mode === 'create') {
        const data = buildCreatePayload();
        const duplicateResult = await checkDuplicates.mutateAsync({
          locale: formData.locale,
          prompts: [data.prompt],
        });

        if (duplicateResult.duplicates.length > 0) {
          setDuplicateResults(duplicateResult.duplicates[0].existingQuestions);
          setPendingCreate(data);
          setDuplicateModalOpen(true);
          return;
        }

        await createQuestion.mutateAsync(data);
        toast.success('Question created successfully');
        setOpen(false);
      } else if (mode === 'edit' && displayQuestion) {
        const data: UpdateQuestionRequest = {
          category_id: formData.category_id,
          difficulty: formData.difficulty,
          status: formData.status,
          prompt: { ...displayQuestion.prompt, [formData.locale]: formData.prompt },
          explanation: formData.explanation
            ? { ...displayQuestion.explanation, [formData.locale]: formData.explanation }
            : displayQuestion.explanation,
          payload: formData.type === 'mcq_single'
            ? {
                type: 'mcq_single',
                options: formData.options.map((opt, idx) => {
                  // Get existing option text to preserve other locales
                  const existingOption = displayQuestion.payload?.type === 'mcq_single'
                    ? displayQuestion.payload.options[idx]
                    : undefined;
                  return {
                    id: opt.id || generateAnswerId(),
                    text: { ...existingOption?.text, [formData.locale]: opt.text },
                    is_correct: opt.is_correct,
                  };
                }),
              }
            : {
                type: 'input_text',
                accepted_answers: formData.acceptedAnswers
                  .filter(a => (a[formData.locale] || '').trim())
                  .map((a, idx) => {
                    // Get existing answer to preserve other locales
                    const existingAnswer = displayQuestion.payload?.type === 'input_text'
                      ? displayQuestion.payload.accepted_answers[idx]
                      : undefined;
                    return { ...existingAnswer, [formData.locale]: a[formData.locale] };
                  }),
                case_sensitive: formData.caseSensitive,
              },
        };

        await updateQuestion.mutateAsync({ id: displayQuestion.id, data });
        toast.success('Question updated successfully');
        setMode('view');
      }
    } catch {
      toast.error(mode === 'create' ? 'Failed to create question' : 'Failed to update question');
    }
  };

  const handleCancel = () => {
    if (mode === 'create') {
      setOpen(false);
    } else {
      setMode('view');
    }
  };

  const renderViewMode = () => {
    if (!displayQuestion) return null;

    return (
      <div className="space-y-6 font-inter">
        {/* Header with badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
            <DifficultySignal difficulty={displayQuestion.difficulty} />
            <span className={cn("text-[10px] font-black uppercase tracking-widest", getDifficultyVariant(displayQuestion.difficulty).split(' ')[1])}>
              {displayQuestion.difficulty}
            </span>
          </div>

          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border-slate-200 bg-slate-50/50">
            {displayQuestion.type}
          </Badge>
          <Badge 
            variant={displayQuestion.status === 'published' ? 'default' : 'secondary'}
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all",
              displayQuestion.status === 'published' ? "bg-slate-900 shadow-sm" : "bg-slate-100 text-slate-500"
            )}
          >
            {displayQuestion.status}
          </Badge>
        </div>

        {/* Question Prompt */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Question</Label>
          <p className="text-lg font-semibold text-slate-900 leading-snug">
            {getLocalizedText(displayQuestion.prompt, 'Untitled Question')}
          </p>
        </div>

        {/* Options (for MCQ) */}
        {displayQuestion.type === 'mcq_single' && displayQuestion.payload?.type === 'mcq_single' && (
          <div className="space-y-3">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Options</Label>
            <div className="grid gap-2 mt-1">
              {displayQuestion.payload.options.map((option, index) => (
                <div
                  key={option.id}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 group',
                    option.is_correct
                      ? 'bg-emerald-50 border-emerald-500 shadow-[0_2px_10px_rgba(16,185,129,0.1)]'
                      : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50'
                  )}
                >
                  <span className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors",
                    option.is_correct ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                  )}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className={cn(
                    "flex-1 text-sm font-medium transition-colors",
                    option.is_correct ? "text-emerald-900" : "text-slate-600"
                  )}>
                    {getLocalizedText(option.text)}
                  </span>
                  {option.is_correct && (
                    <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm animate-in zoom-in duration-300">
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted Answers (for Text Input) */}
        {displayQuestion.type === 'input_text' && displayQuestion.payload?.type === 'input_text' && (
          <div className="space-y-3">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accepted Answers</Label>
            <div className="grid gap-2 mt-1">
              {displayQuestion.payload.accepted_answers.map((answer, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-xl border bg-emerald-50 border-emerald-500 shadow-[0_2px_10px_rgba(16,185,129,0.1)]"
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black bg-emerald-500 text-white">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-emerald-900">
                    {getLocalizedText(answer)}
                  </span>
                  <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  </div>
                </div>
              ))}
            </div>
            {displayQuestion.payload.case_sensitive && (
              <p className="text-xs text-slate-500 font-medium">
                ⚠️ Case sensitive matching enabled
              </p>
            )}
          </div>
        )}

        {/* Explanation */}
        {displayQuestion.explanation && (
          <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Explanation</Label>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              {getLocalizedText(displayQuestion.explanation)}
            </p>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-3 pt-6 border-t border-slate-100">
          <Button
            variant="ghost"
            onClick={handleToggleStatus}
            className={cn(
              "flex-1 h-11 rounded-xl font-bold transition-all text-sm",
              displayQuestion.status === 'published' 
                ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900" 
                : "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
            )}
            disabled={updateStatus.isPending}
          >
            {displayQuestion.status === 'published' ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Unpublish
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Publish Question
              </>
            )}
          </Button>
          <Button 
            variant="outline"
            onClick={handleEdit}
            className="flex-1 h-11 rounded-xl border-slate-200 font-bold text-slate-700 hover:bg-slate-50 transition-all text-sm"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit Details
          </Button>
        </div>
      </div>
    );
  };

  const renderEditMode = () => {
    return (
      <div className="space-y-6 font-inter">
        {/* Category and Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category *</Label>
            <Select value={formData.category_id} onValueChange={(v) => setFormData(prev => ({ ...prev, category_id: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id} className="rounded-lg">
                    {getLocalizedText(cat.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Difficulty *</Label>
            <Select value={formData.difficulty} onValueChange={(v: 'easy' | 'medium' | 'hard') => setFormData(prev => ({ ...prev, difficulty: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all">
                <div className="flex items-center gap-2">
                  <DifficultySignal difficulty={formData.difficulty} />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="easy" className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <DifficultySignal difficulty="easy" />
                    <span>Easy</span>
                  </div>
                </SelectItem>
                <SelectItem value="medium" className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <DifficultySignal difficulty="medium" />
                    <span>Medium</span>
                  </div>
                </SelectItem>
                <SelectItem value="hard" className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <DifficultySignal difficulty="hard" />
                    <span>Hard</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Language *</Label>
            <Select value={formData.locale} onValueChange={(v: 'en' | 'ka') => setFormData(prev => ({ ...prev, locale: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="en" className="rounded-lg">English</SelectItem>
                <SelectItem value="ka" className="rounded-lg">Georgian (KA)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type *</Label>
            <Select value={formData.type} onValueChange={(v: 'mcq_single' | 'input_text') => setFormData(prev => ({ ...prev, type: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="mcq_single" className="rounded-lg font-medium">Multiple Choice</SelectItem>
                <SelectItem value="input_text" className="rounded-lg font-medium">Text Input</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status *</Label>
            <Select value={formData.status} onValueChange={(v: QuestionStatus) => setFormData(prev => ({ ...prev, status: v }))}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="draft" className="rounded-lg font-medium text-slate-500">Draft</SelectItem>
                <SelectItem value="published" className="rounded-lg font-medium text-emerald-600">Published</SelectItem>
                <SelectItem value="archived" className="rounded-lg font-medium text-rose-600">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Question Prompt */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Question *</Label>
          <Textarea
            value={formData.prompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
            placeholder="Enter your question here..."
            className="min-h-[100px] rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all font-medium leading-relaxed resize-none"
          />
        </div>

        {/* Options (MCQ) or Accepted Answers (Text Input) */}
        {formData.type === 'mcq_single' ? (
          <div className="space-y-3">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Options * (click to mark as correct)</Label>
            <div className="grid gap-3 mt-1">
              {formData.options.map((option, index) => (
                <div key={index} className="flex items-center gap-3 group">
                  <span className="font-black text-xs w-6 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                    {String.fromCharCode(65 + index)})
                  </span>
                  <Input
                    value={option.text}
                    onChange={(e) => {
                      const newOptions = [...formData.options];
                      newOptions[index].text = e.target.value;
                      setFormData(prev => ({ ...prev, options: newOptions }));
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + index)} text...`}
                    className="flex-1 h-11 rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newOptions = formData.options.map((opt, i) => ({
                        ...opt,
                        is_correct: i === index,
                      }));
                      setFormData(prev => ({ ...prev, options: newOptions }));
                    }}
                    className={cn(
                      "p-2.5 rounded-xl border transition-all duration-300 shadow-sm",
                      option.is_correct
                        ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-emerald-100"
                        : "bg-white border-slate-200 text-slate-300 hover:border-emerald-200 hover:text-emerald-400"
                    )}
                  >
                    <CheckCircle2 className={cn("h-5 w-5 transition-transform duration-300", option.is_correct ? "scale-110" : "scale-100")} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <TextInputEditor
            acceptedAnswers={formData.acceptedAnswers}
            caseSensitive={formData.caseSensitive}
            locale={formData.locale}
            onChange={(answers, caseSensitive) => {
              setFormData(prev => ({
                ...prev,
                acceptedAnswers: answers,
                caseSensitive,
              }));
            }}
          />
        )}

        {/* Explanation */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Explanation (optional)</Label>
          <Textarea
            value={formData.explanation}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
            placeholder="Provide context for the correct answer..."
            className="min-h-[80px] rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all text-sm font-medium leading-relaxed resize-none text-slate-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t border-slate-100">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="flex-1 h-11 rounded-xl font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all text-sm"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={handleSave}
            className="flex-1 h-11 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 hover:-translate-y-0.5 shadow-md active:translate-y-0 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={updateQuestion.isPending || isSubmitting}
          >
            {mode === 'create' && isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {mode === 'create' ? 'Create Question' : 'Save Changes'}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl bg-white border border-slate-200 shadow-2xl rounded-[1.5rem] p-8 overflow-hidden font-inter focus:outline-none" onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="pr-12 pb-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">
              {mode === 'create' ? 'New Question' : mode === 'edit' ? 'Edit Question' : 'Question Preview'}
            </DialogTitle>
            {mode === 'view' && totalQuestions > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {activeIndex + 1} <span className="text-slate-200 mx-1">/</span> {showLoadingIndicator ? `${totalQuestions} (${totalAvailable})` : totalQuestions}
                </span>
                <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm transition-all"
                    disabled={!hasPrevious}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasPrevious) handleNavigate(activeIndex - 1);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm transition-all"
                    disabled={!hasNext}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasNext) handleNavigate(activeIndex + 1);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="relative">
          {mode === 'view' ? renderViewMode() : renderEditMode()}
        </div>
      </DialogContent>
      <Dialog open={duplicateModalOpen} onOpenChange={setDuplicateModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Possible Duplicate Found</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              We found existing questions with the same prompt in this language.
              Do you want to create anyway?
            </p>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {duplicateResults.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{item.category_name?.en || 'Unknown Category'}</span>
                  <span className="text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDuplicateModalOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!pendingCreate) return;
                try {
                  await createQuestion.mutateAsync(pendingCreate);
                  toast.success('Question created successfully');
                  setDuplicateModalOpen(false);
                  setOpen(false);
                } catch {
                  toast.error('Failed to create question');
                }
              }}
            >
              Create Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
