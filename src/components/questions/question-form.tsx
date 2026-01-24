'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCreateQuestion, useUpdateQuestion, useCategories } from '@/hooks';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import type { Question, McqOption, I18nField } from '@/types';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Info,
  Settings2,
  FileText,
  LayoutList,
  Languages,
  MessageSquare,
  HelpCircle,
  Save,
  CheckCircle2,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { McqEditor } from './mcq-editor';
import { TextInputEditor } from './text-input-editor';

const questionSchema = z.object({
  category_id: z.string().uuid('Please select a category'),
  type: z.enum(['mcq_single', 'input_text']),
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

  // MCQ state
  const [mcqOptions, setMcqOptions] = useState<McqOption[]>([]);

  // Text input state
  const [acceptedAnswers, setAcceptedAnswers] = useState<I18nField[]>([]);
  const [caseSensitive, setCaseSensitive] = useState(false);

  // Preview state
  const [previewLang, setPreviewLang] = useState<'en' | 'ka'>('en');

  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      category_id: '',
      type: 'mcq_single',
      difficulty: 'medium',
      status: 'draft',
      prompt_en: '',
      prompt_ka: '',
      explanation_en: '',
      explanation_ka: '',
    },
  });

  const questionType = form.watch('type');

  // Watch all fields for live preview
  const watched = useWatch({ control: form.control });
  const {
    category_id: categoryId,
    type,
    difficulty,
    prompt_en: promptEn,
    prompt_ka: promptKa,
  } = watched;

  // Compute preview values
  const previewPrompt = previewLang === 'ka' ? promptKa : promptEn;
  const previewCategory = categories?.find((c) => c.id === categoryId);
  const previewCategoryName = previewCategory?.name[previewLang] || previewCategory?.name.en || '';

  // Populate form when editing
  useEffect(() => {
    if (question) {
      form.reset({
        category_id: question.category_id,
        type: question.type,
        difficulty: question.difficulty,
        status: question.status,
        prompt_en: question.prompt.en || '',
        prompt_ka: question.prompt.ka || '',
        explanation_en: question.explanation?.en || '',
        explanation_ka: question.explanation?.ka || '',
      });

      // Load payload
      if (question.payload) {
        if (question.payload.type === 'mcq_single') {
          setMcqOptions(question.payload.options);
        } else if (question.payload.type === 'input_text') {
          setAcceptedAnswers(question.payload.accepted_answers);
          setCaseSensitive(question.payload.case_sensitive);
        }
      }
    }
  }, [question, form]);

  // Reset payload when type changes
  useEffect(() => {
    if (!isEditing) {
      if (questionType === 'mcq_single') {
        setAcceptedAnswers([]);
        setCaseSensitive(false);
      } else {
        setMcqOptions([]);
      }
    }
  }, [questionType, isEditing]);

  async function onSubmit(data: QuestionFormData) {
    // Validate payload
    if (data.type === 'mcq_single') {
      if (mcqOptions.length < 2) {
        toast.error('MCQ questions need at least 2 options');
        return;
      }
      if (!mcqOptions.some((o) => o.is_correct)) {
        toast.error('Please mark one option as correct');
        return;
      }
    } else {
      if (acceptedAnswers.length === 0) {
        toast.error('Text input questions need at least 1 accepted answer');
        return;
      }
    }

    try {
      const payload =
        data.type === 'mcq_single'
          ? { type: 'mcq_single' as const, options: mcqOptions }
          : {
              type: 'input_text' as const,
              accepted_answers: acceptedAnswers,
              case_sensitive: caseSensitive,
            };

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

      if (isEditing) {
        await updateQuestion.mutateAsync({ id: question.id, data: questionData });
        toast.success('Question updated successfully');
      } else {
        await createQuestion.mutateAsync(questionData);
        toast.success('Question created successfully');
      }

      onSuccess?.();
    } catch {
      toast.error(isEditing ? 'Failed to update question' : 'Failed to create question');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-[1200px] mx-auto space-y-6 pb-20">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30 bg-background/80 backdrop-blur-xl p-4 -mx-4 border-b border-white/5 shadow-sm rounded-b-3xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-inner">
              {isEditing ? <Settings2 className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {isEditing ? 'Edit Question' : 'Create Question'}
              </h1>
              <p className="text-xs text-muted-foreground font-medium">
                {previewCategoryName || 'Select a category to begin'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" type="button" size="sm" onClick={() => router.back()} className="rounded-xl h-10 px-4">
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-10 px-6 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 font-bold"
              disabled={createQuestion.isPending || updateQuestion.isPending}
            >
              {createQuestion.isPending || updateQuestion.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {isEditing ? 'Save Changes' : 'Create Question'}
                </span>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Configuration & Content */}
          <div className="lg:col-span-8 space-y-6">
        {/* Live Preview */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold tracking-tight">Live Preview</h3>
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
              <Button type="button" size="sm" variant={previewLang === 'en' ? 'default' : 'ghost'}
                className="h-7 px-3" onClick={() => setPreviewLang('en')}>EN</Button>
              <Button type="button" size="sm" variant={previewLang === 'ka' ? 'default' : 'ghost'}
                className="h-7 px-3" onClick={() => setPreviewLang('ka')}>KA</Button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0a0a0a] p-6 text-white min-h-[280px]">
            {/* Progress bar */}
            <div className="h-1 bg-white/20 rounded-full mb-6">
              <div className="h-full w-1/3 bg-[#22c55e] rounded-full" />
            </div>

            {/* Category/difficulty badge */}
            <span className={cn(
              "inline-block px-3 py-1 rounded-lg text-xs font-bold mb-4",
              difficulty === 'easy' && "bg-emerald-500/20 text-emerald-400",
              difficulty === 'medium' && "bg-amber-500/20 text-amber-400",
              difficulty === 'hard' && "bg-rose-500/20 text-rose-400",
            )}>
              {previewCategoryName || 'Category'}
            </span>

            {/* Question prompt */}
            <p className="text-lg font-medium mb-6">
              {previewPrompt || 'Your question will appear here...'}
            </p>

            {/* MCQ options OR Text input based on type */}
            {type === 'mcq_single' ? (
              <div className="space-y-3">
                {mcqOptions.length > 0 ? mcqOptions.map((opt, i) => (
                  <div key={opt.id} className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border",
                    opt.is_correct ? "bg-emerald-500/10 border-emerald-500/50" : "bg-white/5 border-white/10"
                  )}>
                    <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">
                      {(previewLang === 'ka' ? opt.text.ka : opt.text.en) || `Option ${i + 1}`}
                    </span>
                    {opt.is_correct && (
                      <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                )) : (
                  <p className="text-white/40 text-center py-4">Add options to see preview</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 h-12 rounded-xl bg-white/10 border border-white/20 px-4 flex items-center text-white/40">
                    Type your answer...
                  </div>
                  <div className="px-6 h-12 rounded-xl bg-[#22c55e] font-bold flex items-center">Submit</div>
                </div>
                {acceptedAnswers.length > 0 && (
                  <p className="text-xs text-white/40">
                    Accepted: {acceptedAnswers.map(a => (previewLang === 'ka' ? a.ka : a.en) || a.en).filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

            {/* Content Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Configuration Section */}
              <Card className="border-white/5 bg-card/40 backdrop-blur-xl rounded-[2rem] shadow-xl overflow-hidden">
                <CardHeader className="p-6 pb-2 border-b border-white/5 bg-white/5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                      <Settings2 className="w-4 h-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-bold tracking-tight">Configuration</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 bg-white/5 border-white/10 rounded-xl focus:ring-1 focus:ring-primary/30 transition-all text-xs">
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                            {categories?.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id} className="text-xs">
                                {cat.name[DEFAULT_LANGUAGE] || cat.slug}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="difficulty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Difficulty</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-10 bg-white/5 border-white/10 rounded-xl focus:ring-1 focus:ring-primary/30 transition-all text-xs">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                              <SelectItem value="easy" className="text-xs font-bold text-emerald-500">Easy</SelectItem>
                              <SelectItem value="medium" className="text-xs font-bold text-amber-500">Medium</SelectItem>
                              <SelectItem value="hard" className="text-xs font-bold text-rose-500">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className={cn(
                                "h-10 bg-white/5 border-white/10 rounded-xl focus:ring-1 focus:ring-primary/30 transition-all text-xs font-bold",
                                field.value === 'published' ? "text-emerald-500" : field.value === 'draft' ? "text-amber-500" : "text-muted-foreground"
                              )}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                              <SelectItem value="draft" className="text-xs font-bold text-amber-500">Draft</SelectItem>
                              <SelectItem value="published" className="text-xs font-bold text-emerald-500">Published</SelectItem>
                              <SelectItem value="archived" className="text-xs font-bold text-slate-500">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Type Selection */}
              <Card className="border-white/5 bg-card/40 backdrop-blur-xl rounded-[2rem] shadow-xl overflow-hidden">
                <CardHeader className="p-6 pb-2 border-b border-white/5 bg-white/5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                      <LayoutList className="w-4 h-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-bold tracking-tight">Question Type</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <div className="grid grid-cols-1 gap-3">
                        {[
                          { value: 'mcq_single', label: 'Multiple Choice', icon: LayoutList, desc: 'Single correct answer from options' },
                          { value: 'input_text', label: 'Text Input', icon: FileText, desc: 'User types the correct answer' }
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
                                "flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300 text-left relative overflow-hidden group",
                                isSelected 
                                  ? "bg-primary/10 border-primary/40 shadow-lg shadow-primary/5" 
                                  : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10",
                                isEditing && !isSelected && "opacity-50 grayscale cursor-not-allowed"
                              )}
                            >
                              <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300",
                                isSelected ? "bg-primary text-primary-foreground scale-110" : "bg-white/10 text-muted-foreground group-hover:bg-white/20"
                              )}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <h4 className={cn("text-xs font-bold transition-colors", isSelected ? "text-primary" : "text-foreground")}>{t.label}</h4>
                                <p className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{t.desc}</p>
                              </div>
                              {isSelected && (
                                <div className="absolute top-2 right-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Question Content */}
            <Card className="border-white/5 bg-card/40 backdrop-blur-xl rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="p-6 pb-2 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded-lg">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-bold tracking-tight">Question Content</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <Tabs defaultValue="en" className="w-full">
                  <TabsList className="bg-white/5 border border-white/5 p-1 rounded-xl mb-6">
                    <TabsTrigger value="en" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 h-8 text-[10px] font-black uppercase tracking-widest">
                      <Languages className="w-3.5 h-3.5 mr-2" />
                      English
                    </TabsTrigger>
                    <TabsTrigger value="ka" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-6 h-8 text-[10px] font-black uppercase tracking-widest">
                      <Languages className="w-3.5 h-3.5 mr-2" />
                      Georgian
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="en" className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <FormField
                      control={form.control}
                      name="prompt_en"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Prompt</FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[100px] px-4 py-3 border border-white/10 rounded-2xl text-sm bg-white/5 focus:bg-background focus:ring-1 focus:ring-primary/30 outline-none resize-none transition-all placeholder:text-muted-foreground/30 font-medium leading-relaxed"
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
                      name="explanation_en"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">
                            <Info className="w-3 h-3 text-primary" />
                            Explanation
                          </FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[80px] px-4 py-3 border border-white/10 rounded-2xl text-xs bg-white/5 focus:bg-background focus:ring-1 focus:ring-primary/30 outline-none resize-none transition-all placeholder:text-muted-foreground/30 leading-relaxed"
                              placeholder="Provide context for the correct answer..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="ka" className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                    <FormField
                      control={form.control}
                      name="prompt_ka"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Prompt (Georgian)</FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[100px] px-4 py-3 border border-white/10 rounded-2xl text-sm bg-white/5 focus:bg-background focus:ring-1 focus:ring-primary/30 outline-none resize-none transition-all placeholder:text-muted-foreground/30 font-medium leading-relaxed"
                              placeholder="შეიყვანეთ კითხვის ტექსტი ქართულად..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="explanation_ka"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">
                            <Info className="w-3 h-3 text-primary" />
                            Explanation (Georgian)
                          </FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[80px] px-4 py-3 border border-white/10 rounded-2xl text-xs bg-white/5 focus:bg-background focus:ring-1 focus:ring-primary/30 outline-none resize-none transition-all placeholder:text-muted-foreground/30 leading-relaxed"
                              placeholder="ახსენით რატომ არის ეს პასუხი სწორი..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Payload Editor */}
          <div className="lg:col-span-4 h-full">
            <Card className="border-white/5 bg-card/40 backdrop-blur-xl rounded-[2.5rem] shadow-2xl overflow-hidden sticky top-24">
              <CardHeader className="p-6 border-b border-white/5 bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                      {questionType === 'mcq_single' ? <LayoutList className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold tracking-tight">
                        {questionType === 'mcq_single' ? 'MCQ Options' : 'Accepted Answers'}
                      </CardTitle>
                      <p className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest mt-0.5">
                        {questionType === 'mcq_single' ? 'Select 1 Correct' : 'Direct Typing'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 overflow-y-auto max-h-[calc(100vh-250px)] scrollbar-hide">
                {questionType === 'mcq_single' ? (
                  <McqEditor options={mcqOptions} onChange={setMcqOptions} />
                ) : (
                  <TextInputEditor
                    acceptedAnswers={acceptedAnswers}
                    caseSensitive={caseSensitive}
                    onChange={(answers, sensitive) => {
                      setAcceptedAnswers(answers);
                      setCaseSensitive(sensitive);
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
