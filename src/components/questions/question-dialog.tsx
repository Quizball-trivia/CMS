'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useUpdateQuestionStatus, useUpdateQuestion, useCreateQuestion, useDeleteQuestion, useCategories, useCheckDuplicates, useQuestion } from '@/hooks';
import type {
  CareerPathPayload,
  ClueChainPayload,
  CountdownPayload,
  CreateQuestionRequest,
  FootballLogicPayload,
  HighLowPayload,
  ImposterMultiSelectPayload,
  PutInOrderPayload,
  Question,
  QuestionStatus,
  QuestionType,
  TrueFalsePayload,
  UpdateQuestionRequest,
} from '@/types';
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
import { Eye, EyeOff, Edit, CheckCircle2, ChevronLeft, ChevronRight, Save, X, Loader2, Trash2 } from 'lucide-react';
import { getLocalizedText, getLocalizedTextByLang, cn } from '@/lib/utils';
import { TextInputEditor, type AnswerWithId } from './text-input-editor';
import { TrueFalseEditor } from './true-false-editor';
import { DifficultySignal, getDifficultyVariant } from '@/components/ui/difficulty-signal';
import { createDefaultAdvancedPayload, questionToFormData, generateAnswerId, type AdvancedQuestionPayload } from '@/lib/question-utils';
import { DuplicateConfirmationDialog } from './duplicate-confirmation-dialog';
import { CountdownListEditor } from './countdown-list-editor';
import { ClueChainEditor } from './clue-chain-editor';
import { PutInOrderEditor } from './put-in-order-editor';
import { ImposterEditor } from './imposter-editor';
import { CareerPathEditor } from './career-path-editor';
import { HighLowEditor } from './high-low-editor';
import { FootballLogicEditor } from './football-logic-editor';

type DialogMode = 'view' | 'edit' | 'create';

type EditableQuestionType = Extract<
  QuestionType,
  | 'mcq_single'
  | 'true_false'
  | 'input_text'
  | 'countdown_list'
  | 'clue_chain'
  | 'put_in_order'
  | 'imposter_multi_select'
  | 'career_path'
  | 'high_low'
  | 'football_logic'
>;

interface QuestionDialogProps {
  mode?: DialogMode;
  question?: Question;
  allQuestions?: Question[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
  totalAvailable?: number;
  initialLocale?: 'en' | 'ka';
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
  initialLocale = 'en',
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

  const [viewLang, setViewLang] = useState<'en' | 'ka'>(initialLocale);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: categories } = useCategories();
  const updateStatus = useUpdateQuestionStatus();
  const updateQuestion = useUpdateQuestion();
  const createQuestion = useCreateQuestion();
  const deleteQuestionMutation = useDeleteQuestion();
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
  const { data: freshQuestion } = useQuestion(displayQuestion?.id ?? '', open && !!displayQuestion?.id);
  const hydratedQuestion = freshQuestion ?? displayQuestion;

  // Form state for edit/create mode
  const [formData, setFormData] = useState<{
    category_id: string;
    locale: 'en' | 'ka';
    difficulty: 'easy' | 'medium' | 'hard';
    status: QuestionStatus;
    type: EditableQuestionType;
    prompt: string;
    explanation: string;
    options: Array<{ id?: string; text: string; is_correct: boolean }>;
    acceptedAnswers: AnswerWithId[];
    caseSensitive: boolean;
    customPayload: AdvancedQuestionPayload | null;
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
    customPayload: null,
  });

  // Reset activeIndex when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setActiveIndex(currentIndex);
      setMode(initialMode);
      setConfirmDelete(false);
      setViewLang(initialLocale);

      if (initialMode === 'edit') {
        const selectedQuestion = freshQuestion ?? (allQuestions.length > 0 ? allQuestions[currentIndex] : question);
        if (selectedQuestion) {
          // Load question data into form using utility function
          setFormData(questionToFormData(selectedQuestion, 'en'));
        }
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
          customPayload: null,
        });
      }
    }
  };

  // Handle navigation
  const handleNavigate = useCallback((newIndex: number) => {
    setActiveIndex(newIndex);
    setConfirmDelete(false);
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
    if (!hydratedQuestion) return;

    const newStatus: QuestionStatus = hydratedQuestion.status === 'published' ? 'draft' : 'published';

    try {
      await updateStatus.mutateAsync({ id: hydratedQuestion.id, data: { status: newStatus } });
      toast.success(`Question ${newStatus === 'published' ? 'published' : 'unpublished'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleEdit = () => {
    if (hydratedQuestion) {
      setFormData(questionToFormData(hydratedQuestion, viewLang));
    }
    setMode('edit');
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hydratedQuestion) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      const result = await deleteQuestionMutation.mutateAsync(hydratedQuestion.id);
      toast.success(result.message);
      setConfirmDelete(false);

      if (hasNext) {
        // Stay at same index — next question slides in via React Query invalidation
      } else if (hasPrevious) {
        handleNavigate(activeIndex - 1);
      } else {
        setOpen(false);
      }
    } catch {
      toast.error('Failed to delete question');
    }
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
        : formData.type === 'true_false'
          ? {
              type: 'true_false',
              options: [
                {
                  id: 'true',
                  text: { [locale]: 'True' },
                  is_correct: formData.options.find(option => option.id === 'true')?.is_correct ?? true,
                },
                {
                  id: 'false',
                  text: { [locale]: 'False' },
                  is_correct: formData.options.find(option => option.id === 'false')?.is_correct ?? false,
                },
              ],
            } satisfies TrueFalsePayload
        : formData.type === 'input_text'
          ? {
              type: 'input_text',
              accepted_answers: formData.acceptedAnswers
                .filter(a => (a[locale] || '').trim())
                .map(a => ({ [locale]: a[locale] })),
              case_sensitive: formData.caseSensitive,
            }
          : formData.customPayload!,
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
    } else if (formData.type === 'true_false') {
      const correctCount = formData.options.filter(o => o.is_correct).length;
      if (correctCount !== 1) {
        toast.error('Please mark exactly one answer as correct');
        return;
      }
    } else if (formData.type === 'input_text') {
      const validAnswers = formData.acceptedAnswers.filter(a => (a[formData.locale] || '').trim());
      if (validAnswers.length === 0) {
        toast.error('At least one accepted answer is required');
        return;
      }
    } else if (!formData.customPayload || formData.customPayload.type !== formData.type) {
      toast.error('Challenge payload is incomplete');
      return;
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
      } else if (mode === 'edit' && hydratedQuestion) {
        const data: UpdateQuestionRequest = {
          category_id: formData.category_id,
          difficulty: formData.difficulty,
          status: formData.status,
          prompt: { ...hydratedQuestion.prompt, [formData.locale]: formData.prompt },
          explanation: formData.explanation
            ? { ...hydratedQuestion.explanation, [formData.locale]: formData.explanation }
            : hydratedQuestion.explanation,
          payload: formData.type === 'mcq_single'
            ? {
                type: 'mcq_single',
                options: formData.options.map((opt, idx) => {
                  const optionId = opt.id || generateAnswerId();
                  const existingOption = hydratedQuestion.payload?.type === 'mcq_single'
                    ? hydratedQuestion.payload.options.find(o => o.id === optionId)
                      ?? hydratedQuestion.payload.options[idx]
                    : undefined;
                  return {
                    id: optionId,
                    text: { ...existingOption?.text, [formData.locale]: opt.text },
                    is_correct: opt.is_correct,
                  };
                }),
              }
            : formData.type === 'true_false'
              ? {
                  type: 'true_false',
                  options: [
                    {
                      id: 'true',
                      text: {
                        ...(hydratedQuestion.payload?.type === 'true_false' ? hydratedQuestion.payload.options[0]?.text : {}),
                        [formData.locale]: 'True',
                      },
                      is_correct: formData.options.find(option => option.id === 'true')?.is_correct ?? true,
                    },
                    {
                      id: 'false',
                      text: {
                        ...(hydratedQuestion.payload?.type === 'true_false' ? hydratedQuestion.payload.options[1]?.text : {}),
                        [formData.locale]: 'False',
                      },
                      is_correct: formData.options.find(option => option.id === 'false')?.is_correct ?? false,
                    },
                  ],
                } satisfies TrueFalsePayload
            : formData.type === 'input_text'
              ? {
                  type: 'input_text',
                  accepted_answers: formData.acceptedAnswers
                    .filter(a => (a[formData.locale] || '').trim())
                    .map((a, idx) => {
                      const existingAnswer = hydratedQuestion.payload?.type === 'input_text'
                        ? (hydratedQuestion.payload.accepted_answers as Array<Record<string, string> & { id?: string }>)
                          .find(answer => answer.id === a.id)
                          ?? hydratedQuestion.payload.accepted_answers[idx]
                        : undefined;
                      return { ...existingAnswer, [formData.locale]: a[formData.locale] };
                    }),
                  case_sensitive: formData.caseSensitive,
                }
              : formData.customPayload!,
        };

        await updateQuestion.mutateAsync({ id: hydratedQuestion.id, data });
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
    if (!hydratedQuestion) return null;

    return (
      <div className="space-y-6 font-inter">
        {/* Header with badges + language toggle */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
              <DifficultySignal difficulty={hydratedQuestion.difficulty} />
              <span className={cn("text-[10px] font-black uppercase tracking-widest", getDifficultyVariant(hydratedQuestion.difficulty).split(' ')[1])}>
                {hydratedQuestion.difficulty}
              </span>
            </div>

            <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border-slate-200 bg-slate-50/50">
              {hydratedQuestion.type}
            </Badge>
            <Badge
              variant={hydratedQuestion.status === 'published' ? 'default' : 'secondary'}
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all",
                hydratedQuestion.status === 'published' ? "bg-slate-900 shadow-sm" : "bg-slate-100 text-slate-500"
              )}
            >
              {hydratedQuestion.status}
            </Badge>
          </div>

          {/* Language toggle */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-black uppercase tracking-widest">
            <button
              className={cn(
                'px-3 py-1.5 transition-all',
                viewLang === 'en' ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'
              )}
              onClick={() => setViewLang('en')}
            >
              EN
            </button>
            <button
              className={cn(
                'px-3 py-1.5 transition-all',
                viewLang === 'ka' ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'
              )}
              onClick={() => setViewLang('ka')}
            >
              KA
            </button>
          </div>
        </div>

        {/* Question Prompt */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Question</Label>
          <p className="text-lg font-semibold text-slate-900 leading-snug">
            {getLocalizedTextByLang(hydratedQuestion.prompt, viewLang, 'Untitled Question')}
          </p>
        </div>

        {/* Options (for MCQ) */}
        {hydratedQuestion.type === 'mcq_single' && hydratedQuestion.payload?.type === 'mcq_single' && (
          <div className="space-y-3">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Options</Label>
            <div className="grid gap-2 mt-1">
              {hydratedQuestion.payload.options.map((option, index) => (
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
                    {getLocalizedTextByLang(option.text, viewLang)}
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
        {hydratedQuestion.type === 'input_text' && hydratedQuestion.payload?.type === 'input_text' && (
          <div className="space-y-3">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accepted Answers</Label>
            <div className="grid gap-2 mt-1">
              {hydratedQuestion.payload.accepted_answers.map((answer, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-xl border bg-emerald-50 border-emerald-500 shadow-[0_2px_10px_rgba(16,185,129,0.1)]"
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black bg-emerald-500 text-white">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-emerald-900">
                    {getLocalizedTextByLang(answer, viewLang)}
                  </span>
                  <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  </div>
                </div>
              ))}
            </div>
            {hydratedQuestion.payload.case_sensitive && (
              <p className="text-xs text-slate-500 font-medium">
                Case sensitive matching enabled
              </p>
            )}
          </div>
        )}

        {/* Explanation */}
        {hydratedQuestion.explanation && (
          <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Explanation</Label>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              {getLocalizedTextByLang(hydratedQuestion.explanation, viewLang)}
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
              hydratedQuestion.status === 'published'
                ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                : "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
            )}
            disabled={updateStatus.isPending}
          >
            {hydratedQuestion.status === 'published' ? (
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
          <Button
            variant={confirmDelete ? 'destructive' : 'ghost'}
            onClick={handleDelete}
            disabled={deleteQuestionMutation.isPending}
            className={cn(
              "h-11 rounded-xl font-bold transition-all text-sm",
              !confirmDelete && "text-red-400 hover:bg-red-50 hover:text-red-600"
            )}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </Button>
        </div>
      </div>
    );
  };

  const renderEditMode = () => {
    return (
      <div className="space-y-4 font-inter">
        {/* Row 1: Category + Difficulty */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category *</Label>
            <Select value={formData.category_id} onValueChange={(v) => setFormData(prev => ({ ...prev, category_id: v }))}>
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-sm">
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

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Difficulty *</Label>
            <Select value={formData.difficulty} onValueChange={(v: 'easy' | 'medium' | 'hard') => setFormData(prev => ({ ...prev, difficulty: v }))}>
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-sm">
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

        {/* Row 2: Language + Type + Status — all in one row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Language *</Label>
            <Select value={formData.locale} onValueChange={(v: 'en' | 'ka') => {
              if (mode === 'edit' && hydratedQuestion) {
                setFormData(questionToFormData(hydratedQuestion, v));
              } else {
                setFormData(prev => ({ ...prev, locale: v }));
              }
            }}>
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="en" className="rounded-lg">English</SelectItem>
                <SelectItem value="ka" className="rounded-lg">Georgian (KA)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(v: EditableQuestionType) =>
                setFormData(prev => ({
                  ...prev,
                  type: v,
                  customPayload: v === 'mcq_single' || v === 'true_false' || v === 'input_text' ? null : createDefaultAdvancedPayload(v),
                  options: v === 'true_false'
                    ? [
                        { id: 'true', text: 'True', is_correct: true },
                        { id: 'false', text: 'False', is_correct: false },
                      ]
                    : prev.options,
                }))
              }
            >
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="mcq_single" className="rounded-lg font-medium">Multiple Choice</SelectItem>
                <SelectItem value="true_false" className="rounded-lg font-medium">True / False</SelectItem>
                <SelectItem value="input_text" className="rounded-lg font-medium">Text Input</SelectItem>
                <SelectItem value="countdown_list" className="rounded-lg font-medium">Countdown List</SelectItem>
                <SelectItem value="clue_chain" className="rounded-lg font-medium">Clue Chain</SelectItem>
                <SelectItem value="put_in_order" className="rounded-lg font-medium">Put In Order</SelectItem>
                <SelectItem value="imposter_multi_select" className="rounded-lg font-medium">Imposter</SelectItem>
                <SelectItem value="career_path" className="rounded-lg font-medium">Career Path</SelectItem>
                <SelectItem value="high_low" className="rounded-lg font-medium">High Low</SelectItem>
                <SelectItem value="football_logic" className="rounded-lg font-medium">Football Logic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status *</Label>
            <Select value={formData.status} onValueChange={(v: QuestionStatus) => setFormData(prev => ({ ...prev, status: v }))}>
              <SelectTrigger className="h-9 rounded-lg border-slate-200 bg-white text-sm">
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
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Question *</Label>
          <Textarea
            value={formData.prompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
            placeholder="Enter your question here..."
            className="min-h-[72px] rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all font-medium leading-relaxed resize-none text-sm"
          />
        </div>

        {/* Options (MCQ) or Accepted Answers (Text Input) */}
        {formData.type === 'mcq_single' ? (
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Options * (click to mark correct)</Label>
            <div className="grid gap-2">
              {formData.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2 group">
                  <span className="font-black text-xs w-5 text-slate-300 group-focus-within:text-slate-900 transition-colors">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <Input
                    value={option.text}
                    onChange={(e) => {
                      const newOptions = [...formData.options];
                      newOptions[index].text = e.target.value;
                      setFormData(prev => ({ ...prev, options: newOptions }));
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + index)}...`}
                    className="flex-1 h-9 rounded-lg border-slate-200 bg-white transition-all font-medium text-sm"
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
                      "p-1.5 rounded-lg border transition-all duration-300",
                      option.is_correct
                        ? "bg-emerald-50 border-emerald-500 text-emerald-600"
                        : "bg-white border-slate-200 text-slate-300 hover:border-emerald-200 hover:text-emerald-400"
                    )}
                  >
                    <CheckCircle2 className={cn("h-4 w-4 transition-transform duration-300", option.is_correct ? "scale-110" : "scale-100")} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : formData.type === 'true_false' ? (
          <TrueFalseEditor
            options={formData.options.map((option) => ({
              id: option.id,
              text: { [formData.locale]: option.text, en: option.id === 'true' ? 'True' : 'False' },
              is_correct: option.is_correct,
            }))}
            locale={formData.locale}
            onChange={(options) => {
              setFormData(prev => ({
                ...prev,
                options: options.map((option) => ({
                  id: option.id,
                  text: option.text[formData.locale] || option.text.en || '',
                  is_correct: option.is_correct,
                })),
              }));
            }}
          />
        ) : formData.type === 'input_text' ? (
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
        ) : formData.type === 'countdown_list' && formData.customPayload?.type === 'countdown_list' ? (
          <CountdownListEditor
            payload={formData.customPayload as CountdownPayload}
            locale={formData.locale}
            onChange={(payload) => setFormData(prev => ({ ...prev, customPayload: payload }))}
          />
        ) : formData.type === 'clue_chain' && formData.customPayload?.type === 'clue_chain' ? (
          <ClueChainEditor
            payload={formData.customPayload as ClueChainPayload}
            locale={formData.locale}
            onChange={(payload) => setFormData(prev => ({ ...prev, customPayload: payload }))}
          />
        ) : formData.type === 'put_in_order' && formData.customPayload?.type === 'put_in_order' ? (
          <PutInOrderEditor
            payload={formData.customPayload as PutInOrderPayload}
            locale={formData.locale}
            onChange={(payload) => setFormData(prev => ({ ...prev, customPayload: payload }))}
          />
        ) : formData.type === 'imposter_multi_select' && formData.customPayload?.type === 'imposter_multi_select' ? (
          <ImposterEditor
            payload={formData.customPayload as ImposterMultiSelectPayload}
            locale={formData.locale}
            onChange={(payload) => setFormData(prev => ({ ...prev, customPayload: payload }))}
          />
        ) : formData.type === 'career_path' && formData.customPayload?.type === 'career_path' ? (
          <CareerPathEditor
            payload={formData.customPayload as CareerPathPayload}
            locale={formData.locale}
            onChange={(payload) => setFormData(prev => ({ ...prev, customPayload: payload }))}
          />
        ) : formData.type === 'high_low' && formData.customPayload?.type === 'high_low' ? (
          <HighLowEditor
            payload={formData.customPayload as HighLowPayload}
            locale={formData.locale}
            onChange={(payload) => setFormData(prev => ({ ...prev, customPayload: payload }))}
          />
        ) : formData.type === 'football_logic' && formData.customPayload?.type === 'football_logic' ? (
          <FootballLogicEditor
            payload={formData.customPayload as FootballLogicPayload}
            locale={formData.locale}
            onChange={(payload) => setFormData(prev => ({ ...prev, customPayload: payload }))}
          />
        ) : (
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Challenge Payload *</Label>
            <p className="text-xs text-slate-500">Select a supported challenge type to edit structured payload fields.</p>
          </div>
        )}

        {/* Explanation */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Explanation (optional)</Label>
          <Textarea
            value={formData.explanation}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
            placeholder="Context for the correct answer..."
            className="min-h-[56px] rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all text-sm font-medium leading-relaxed resize-none text-slate-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-100">
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
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto bg-white border border-slate-200 shadow-2xl rounded-[1.5rem] p-5 sm:p-6 font-inter focus:outline-none" onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="pr-12 pb-4">
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
      <DuplicateConfirmationDialog
        open={duplicateModalOpen}
        onOpenChange={setDuplicateModalOpen}
        duplicates={duplicateResults}
        isCreating={createQuestion.isPending}
        onConfirm={async () => {
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
        onCancel={() => setDuplicateModalOpen(false)}
      />
    </Dialog>
  );
}
