'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCreateQuestion, useUpdateQuestion, useCategories } from '@/hooks';
import type { ClueChainPayload, CountdownPayload, PutInOrderPayload, Question, McqOption, AnswerWithId, TrueFalsePayload } from '@/types';
import { createDefaultAdvancedPayload, generateAnswerId, type AdvancedQuestionPayload } from '@/lib/question-utils';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Settings2,
  FileText,
  LayoutList,
  MessageSquare,
  Save,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { cn, getLocalizedText } from '@/lib/utils';
import { McqEditor } from './mcq-editor';
import { TextInputEditor } from './text-input-editor';
import { TrueFalseEditor } from './true-false-editor';
import { QuestionPreview } from './question-preview';
import { CountdownListEditor } from './countdown-list-editor';
import { ClueChainEditor } from './clue-chain-editor';
import { PutInOrderEditor } from './put-in-order-editor';

const questionSchema = z.object({
  category_id: z.string().uuid('Please select a category'),
  type: z.enum(['mcq_single', 'true_false', 'input_text', 'countdown_list', 'clue_chain', 'put_in_order']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  status: z.enum(['draft', 'published', 'archived']),
  prompt_en: z.string().min(1, 'English prompt is required'),
  prompt_ka: z.string().optional(),
  explanation_en: z.string().optional(),
  explanation_ka: z.string().optional(),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface QuestionFormProps {
  question?: Question;
  onSuccess?: () => void;
}

export function QuestionForm({ question, onSuccess }: QuestionFormProps) {
  const router = useRouter();
  const { data: categories } = useCategories();
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();

  const isEditing = !!question;

  // Track if we've logged the mount (only log once per component instance)
  const hasLoggedMount = useRef(false);
  useEffect(() => {
    if (!hasLoggedMount.current) {
      hasLoggedMount.current = true;
      logger.debug('questions', 'QuestionForm mounted', {
        isEditing,
        questionId: question?.id,
        questionType: question?.type,
      });
    }
  }, [isEditing, question?.id, question?.type]);

  // MCQ state - initialize from question if editing
  const [mcqOptions, setMcqOptions] = useState<McqOption[]>(() => {
    if (question?.payload?.type === 'mcq_single' || question?.payload?.type === 'true_false') {
      return question.payload.options;
    }
    return [];
  });

  // Text input state - using AnswerWithId for stable React keys
  const [acceptedAnswers, setAcceptedAnswers] = useState<AnswerWithId[]>(() => {
    if (question?.payload?.type === 'input_text') {
      return question.payload.accepted_answers.map((a) => ({
        ...a,
        id: generateAnswerId(),
      }));
    }
    return [];
  });
  const [caseSensitive, setCaseSensitive] = useState(() => {
    if (question?.payload?.type === 'input_text') {
      return question.payload.case_sensitive;
    }
    return false;
  });
  const [customPayload, setCustomPayload] = useState<AdvancedQuestionPayload | null>(() => {
    if (
      question?.payload
      && question.payload.type !== 'mcq_single'
      && question.payload.type !== 'true_false'
      && question.payload.type !== 'input_text'
    ) {
      return question.payload;
    }
    return null;
  });

  // Preview state
  const [previewLang, setPreviewLang] = useState<'en' | 'ka'>('en');

  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      category_id: question?.category_id ?? '',
      type: question?.type ?? 'mcq_single',
      difficulty: question?.difficulty ?? 'medium',
      status: question?.status ?? 'draft',
      prompt_en: question?.prompt.en ?? '',
      prompt_ka: question?.prompt.ka ?? '',
      explanation_en: question?.explanation?.en ?? '',
      explanation_ka: question?.explanation?.ka ?? '',
    },
  });

  // Watch only the specific fields needed for preview (more efficient than watching all)
  const questionType = useWatch({ control: form.control, name: 'type' });
  const categoryId = useWatch({ control: form.control, name: 'category_id' });
  const difficulty = useWatch({ control: form.control, name: 'difficulty' });
  const promptEn = useWatch({ control: form.control, name: 'prompt_en' });
  const promptKa = useWatch({ control: form.control, name: 'prompt_ka' });

  // Compute preview values
  const previewPrompt = previewLang === 'ka' ? promptKa : promptEn;
  const previewCategory = categories?.find((c) => c.id === categoryId);
  const previewCategoryName = previewCategory
    ? (previewCategory.name[previewLang] || previewCategory.name.en || '')
    : '';

  // Log when form is populated (state is now initialized via defaultValues and useState initializers)
  useEffect(() => {
    if (question) {
      logger.info('questions', 'Form initialized with question', {
        id: question.id,
        type: question.type,
        category_id: question.category_id,
        formCategoryId: form.getValues('category_id'),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset payload when type changes
  useEffect(() => {
    if (!isEditing) {
      if (questionType === 'mcq_single') {
        setAcceptedAnswers([]);
        setCaseSensitive(false);
        setCustomPayload(null);
      } else if (questionType === 'true_false') {
        setAcceptedAnswers([]);
        setCaseSensitive(false);
        setCustomPayload(null);
        setMcqOptions([
          { id: 'true', text: { en: 'True', ka: 'True' }, is_correct: true },
          { id: 'false', text: { en: 'False', ka: 'False' }, is_correct: false },
        ]);
      } else if (questionType === 'input_text') {
        setMcqOptions([]);
        setCustomPayload(null);
      } else {
        setMcqOptions([]);
        setAcceptedAnswers([]);
        setCaseSensitive(false);
        setCustomPayload((current) => current?.type === questionType ? current : createDefaultAdvancedPayload(questionType));
      }
    }
  }, [questionType, isEditing]);

  async function onSubmit(data: QuestionFormData) {
    logger.info('questions', 'Form submitted', { formData: data, mcqOptions, acceptedAnswers, caseSensitive });

    // Validate payload
    if (data.type === 'mcq_single') {
      if (mcqOptions.length < 2) {
        logger.warn('questions', 'MCQ validation failed: not enough options', { count: mcqOptions.length });
        toast.error('MCQ questions need at least 2 options');
        return;
      }
      if (!mcqOptions.some((o) => o.is_correct)) {
        logger.warn('questions', 'MCQ validation failed: no correct option');
        toast.error('Please mark one option as correct');
        return;
      }
    } else if (data.type === 'true_false') {
      if (mcqOptions.length !== 2 || !mcqOptions.some((o) => o.is_correct)) {
        toast.error('True/False questions need one correct answer selected');
        return;
      }
    } else if (data.type === 'input_text') {
      if (acceptedAnswers.length === 0) {
        logger.warn('questions', 'Text input validation failed: no answers');
        toast.error('Text input questions need at least 1 accepted answer');
        return;
      }
    } else {
      if (!customPayload || customPayload.type !== data.type) {
        toast.error('Question payload is incomplete');
        return;
      }
    }

    try {
      // Strip IDs from answers before sending to API
      const payload =
        data.type === 'mcq_single'
          ? { type: 'mcq_single' as const, options: mcqOptions }
          : data.type === 'true_false'
            ? {
              type: 'true_false' as const,
              options: [
                {
                  id: 'true',
                  text: {
                    en: mcqOptions.find((option) => option.id === 'true')?.text.en || 'True',
                    ...(mcqOptions.find((option) => option.id === 'true')?.text.ka
                      ? { ka: mcqOptions.find((option) => option.id === 'true')?.text.ka }
                      : {}),
                  },
                  is_correct: mcqOptions.find((option) => option.id === 'true')?.is_correct ?? true,
                },
                {
                  id: 'false',
                  text: {
                    en: mcqOptions.find((option) => option.id === 'false')?.text.en || 'False',
                    ...(mcqOptions.find((option) => option.id === 'false')?.text.ka
                      ? { ka: mcqOptions.find((option) => option.id === 'false')?.text.ka }
                      : {}),
                  },
                  is_correct: mcqOptions.find((option) => option.id === 'false')?.is_correct ?? false,
                },
              ],
            } satisfies TrueFalsePayload
          : data.type === 'input_text'
            ? {
              type: 'input_text' as const,
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              accepted_answers: acceptedAnswers.map(({ id: _unusedId, ...rest }) => rest),
              case_sensitive: caseSensitive,
            }
            : customPayload!;

      const questionData = {
        category_id: data.category_id,
        type: data.type,
        difficulty: data.difficulty,
        status: data.status,
        prompt: {
          en: data.prompt_en,
          ...(data.prompt_ka && { ka: data.prompt_ka }),
        },
        explanation:
          data.explanation_en || data.explanation_ka
            ? {
                ...(data.explanation_en && { en: data.explanation_en }),
                ...(data.explanation_ka && { ka: data.explanation_ka }),
              }
            : null,
        payload,
      };

      logger.info('questions', 'Sending question to API', { questionData, isEditing });

      if (isEditing) {
        const result = await updateQuestion.mutateAsync({ id: question.id, data: questionData });
        logger.info('questions', 'Question updated successfully', { result });
        toast.success('Question updated successfully');
      } else {
        const result = await createQuestion.mutateAsync(questionData);
        logger.info('questions', 'Question created successfully', { result });
        toast.success('Question created successfully');
      }

      onSuccess?.();
    } catch (error) {
      logger.error('questions', 'Failed to save question', { error: error instanceof Error ? error.message : error });
      toast.error(isEditing ? 'Failed to update question' : 'Failed to create question');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-[1200px] mx-auto space-y-8 pb-20 px-4">
        {/* Top Configuration Card - Floating Header */}
        <div className="bg-white border border-gray-200/60 rounded-[1.5rem] p-4 shadow-sm flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-gray-50 border border-gray-100 text-gray-400">
              {isEditing ? <Settings2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {isEditing ? 'Update Question' : 'Create Question'}
              </h3>
              <p className="text-[11px] text-gray-400 font-medium leading-none">
                {isEditing ? 'Update question details' : 'Define your quiz question'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-10 w-44 bg-gray-50/50 border-gray-200 rounded-xl text-xs font-medium text-gray-600 focus:ring-1 focus:ring-primary/20">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id} className="text-xs font-medium">
                        {getLocalizedText(cat.name, cat.slug)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />

            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-10 w-28 bg-gray-50/50 border-gray-200 rounded-xl text-xs font-medium text-gray-600 focus:ring-1 focus:ring-primary/20">
                      <SelectValue placeholder="Difficulty" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                    <SelectItem value="easy" className="text-xs font-medium text-emerald-600">Easy</SelectItem>
                    <SelectItem value="medium" className="text-xs font-medium text-amber-600">Medium</SelectItem>
                    <SelectItem value="hard" className="text-xs font-medium text-rose-600">Hard</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />

            <div className="w-px h-6 bg-gray-100 mx-1" />

            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <Button
              type="submit"
              className="h-11 px-6 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold transition-all active:scale-95 shadow-lg shadow-gray-200 flex items-center gap-2"
              disabled={createQuestion.isPending || updateQuestion.isPending}
            >
              <Save className="w-4 h-4" />
              {isEditing ? 'Save Changes' : 'Create Question'}
            </Button>
          </div>
        </div>

        {/* Live Preview & MCQ Options - Top Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">Live Preview</h2>
            </div>
              <QuestionPreview
                prompt={previewPrompt}
                categoryName={previewCategoryName}
                difficulty={difficulty}
                type={questionType}
              mcqOptions={mcqOptions}
              acceptedAnswers={acceptedAnswers}
              previewLang={previewLang}
            />
          </div>

          <div className="lg:col-span-4 h-full">
            <Card className="border border-gray-200/60 bg-white rounded-[2rem] shadow-sm overflow-hidden min-h-[340px]">
              <CardHeader className="p-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                      {questionType === 'mcq_single' || questionType === 'true_false' ? <LayoutList className="w-5 h-5 text-gray-400" /> : <FileText className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold tracking-tight text-gray-900">
                      {questionType === 'mcq_single' ? 'MCQ Options' : questionType === 'true_false' ? 'True / False' : questionType === 'input_text' ? 'Answers' : 'Challenge Editor'}
                    </CardTitle>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 leading-none">
                      {questionType === 'mcq_single' ? 'Select 1 Correct' : questionType === 'true_false' ? 'Fixed Answers' : questionType === 'input_text' ? 'Direct Typing' : 'Typed Payload'}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0 overflow-y-auto max-h-[400px] scrollbar-hide">
                {questionType === 'mcq_single' ? (
                  <McqEditor options={mcqOptions} onChange={setMcqOptions} locale={previewLang} />
                ) : questionType === 'true_false' ? (
                  <TrueFalseEditor
                    options={mcqOptions}
                    onChange={(options) => setMcqOptions(options.map((option) => ({ ...option, id: option.id ?? generateAnswerId() })))}
                    locale={previewLang}
                  />
                ) : questionType === 'input_text' ? (
                  <TextInputEditor
                    acceptedAnswers={acceptedAnswers}
                    caseSensitive={caseSensitive}
                    locale={previewLang}
                    onChange={(answers, sensitive) => {
                      setAcceptedAnswers(answers);
                      setCaseSensitive(sensitive);
                    }}
                  />
                ) : questionType === 'countdown_list' && customPayload?.type === 'countdown_list' ? (
                  <CountdownListEditor
                    payload={customPayload as CountdownPayload}
                    locale={previewLang}
                    onChange={(payload) => setCustomPayload(payload)}
                  />
                ) : questionType === 'clue_chain' && customPayload?.type === 'clue_chain' ? (
                  <ClueChainEditor
                    payload={customPayload as ClueChainPayload}
                    locale={previewLang}
                    onChange={(payload) => setCustomPayload(payload)}
                  />
                ) : questionType === 'put_in_order' && customPayload?.type === 'put_in_order' ? (
                  <PutInOrderEditor
                    payload={customPayload as PutInOrderPayload}
                    locale={previewLang}
                    onChange={(payload) => setCustomPayload(payload)}
                  />
                ) : (
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Select a supported challenge question type to edit its payload.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Question Type & Content - Bottom Surface Grid */}
        <div className="bg-white/50 border border-gray-200/60 rounded-[2.5rem] shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-x divide-gray-100">
            {/* Left: Type Picker */}
            <div className="lg:col-span-4 p-8 space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-gray-900">Question Type</h2>
                <p className="text-xs text-gray-400 font-medium">Select how players answer</p>
              </div>
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <div className="space-y-3">
                    {[
                      { value: 'mcq_single', label: 'Multiple Choice', icon: LayoutList, desc: 'Single correct answer from options' },
                      { value: 'true_false', label: 'True / False', icon: LayoutList, desc: 'Binary statement with fixed True and False answers' },
                      { value: 'input_text', label: 'Text Input', icon: FileText, desc: 'User types the correct answer' },
                      { value: 'countdown_list', label: 'Countdown List', icon: FileText, desc: 'List-building answer groups for countdown mode' },
                      { value: 'clue_chain', label: 'Clue Chain', icon: FileText, desc: 'Progressive clue reveals with accepted answers' },
                      { value: 'put_in_order', label: 'Put In Order', icon: FileText, desc: 'Sortable football timeline or ranking data' },
                    ].map((t) => {
                      const Icon = t.icon;
                      const isSelected = field.value === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          disabled={isEditing}
                          onClick={() => field.onChange(t.value)}
                          className={cn(
                            "w-full flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300 text-left relative overflow-hidden group",
                            isSelected 
                              ? "bg-gray-50 border-gray-300 shadow-inner" 
                              : "bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50/50",
                            isEditing && !isSelected && "opacity-50 grayscale cursor-not-allowed"
                          )}
                        >
                          <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300",
                            isSelected ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                          )}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <h4 className={cn("text-sm font-bold transition-colors", isSelected ? "text-gray-900" : "text-gray-600")}>{t.label}</h4>
                            <p className="text-[11px] text-gray-400 font-medium leading-tight mt-0.5">{t.desc}</p>
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-gray-900" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* Right: Content Editor */}
            <div className="lg:col-span-8 p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gray-100 rounded-lg">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">Question Content</h2>
                </div>
                <div className="flex p-0.5 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setPreviewLang('en')}
                    className={cn(
                      "px-4 py-1.5 text-[10px] font-black rounded-md transition-all",
                      previewLang === 'en' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    ENGLISH
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLang('ka')}
                    className={cn(
                      "px-4 py-1.5 text-[10px] font-black rounded-md transition-all",
                      previewLang === 'ka' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    GEORGIAN
                  </button>
                </div>
              </div>

              <div className="space-y-10">
                <FormField
                  control={form.control}
                  name={previewLang === 'ka' ? 'prompt_ka' : 'prompt_en'}
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Prompt</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full min-h-[100px] px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-2xl text-base font-medium text-gray-900 focus:bg-white focus:border-gray-200 focus:ring-4 focus:ring-gray-100 outline-none resize-none transition-all placeholder:text-gray-200 leading-relaxed"
                          placeholder="Type the question content here..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={previewLang === 'ka' ? 'explanation_ka' : 'explanation_en'}
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Explanation (Optional)</FormLabel>
                      <FormControl>
                        <textarea
                          className="w-full min-h-[80px] px-4 py-3 bg-gray-50/50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-500 focus:bg-white focus:border-gray-200 focus:ring-4 focus:ring-gray-100 outline-none resize-none transition-all placeholder:text-gray-200 leading-relaxed"
                          placeholder="Provide context for the correct answer..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
