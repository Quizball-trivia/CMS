'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 animate-in fade-in duration-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <HelpCircle className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEditing ? 'Edit Question' : 'Create New Question'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="shadow-lg shadow-primary/20 transition-all active:scale-95"
              disabled={createQuestion.isPending || updateQuestion.isPending}
            >
              {createQuestion.isPending || updateQuestion.isPending ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isEditing ? 'Update Question' : 'Create Question'}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Side: Configuration & Content */}
          <div className="xl:col-span-2 space-y-8">
            <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" />
                  <CardTitle>Configuration</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-muted/30 focus:bg-background transition-colors">
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories?.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name[DEFAULT_LANGUAGE] || cat.slug}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={isEditing}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-muted/30 focus:bg-background transition-colors">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="mcq_single">
                              <div className="flex items-center gap-2">
                                <LayoutList className="w-4 h-4 text-primary" />
                                <span>Multiple Choice</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="input_text">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-primary" />
                                <span>Text Input</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="difficulty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Difficulty</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-muted/30 focus:bg-background transition-colors">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="easy" className="text-emerald-600 font-medium">Easy</SelectItem>
                            <SelectItem value="medium" className="text-amber-600 font-medium">Medium</SelectItem>
                            <SelectItem value="hard" className="text-rose-600 font-medium">Hard</SelectItem>
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
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={cn(
                              "bg-muted/30 transition-colors",
                              field.value === 'published' ? "text-emerald-600 font-semibold" : 
                              field.value === 'draft' ? "text-amber-600 font-semibold" : "text-muted-foreground"
                            )}>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft" className="text-amber-600 font-medium">Draft</SelectItem>
                            <SelectItem value="published" className="text-emerald-600 font-medium">Published</SelectItem>
                            <SelectItem value="archived" className="text-slate-600 font-medium">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

              </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <CardTitle>Question Content</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Tabs defaultValue="en" className="w-full">
                  <div className="flex items-center justify-between mb-4">
                    <TabsList className="bg-muted/50 p-1">
                      <TabsTrigger value="en" className="data-[state=active]:bg-background">
                        <Languages className="w-4 h-4 mr-2" />
                        English
                      </TabsTrigger>
                      <TabsTrigger value="ka" className="data-[state=active]:bg-background">
                        <Languages className="w-4 h-4 mr-2" />
                        Georgian
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="en" className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <FormField
                      control={form.control}
                      name="prompt_en"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prompt</FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[120px] px-3 py-2 border rounded-md text-sm bg-muted/10 focus:bg-background resize-none transition-all"
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
                          <FormLabel className="flex items-center gap-2">
                            <Info className="w-4 h-4 text-primary" />
                            Explanation
                          </FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[80px] px-3 py-2 border rounded-md text-xs bg-muted/10 focus:bg-background resize-none transition-all"
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
                          <FormLabel>Prompt (Georgian)</FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[120px] px-3 py-2 border rounded-md text-sm bg-muted/10 focus:bg-background resize-none transition-all font-medium"
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
                          <FormLabel className="flex items-center gap-2">
                            <Info className="w-4 h-4 text-primary" />
                            Explanation (Georgian)
                          </FormLabel>
                          <FormControl>
                            <textarea
                              className="w-full min-h-[80px] px-3 py-2 border rounded-md text-xs bg-muted/10 focus:bg-background resize-none transition-all"
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

          {/* Right Side: Payload Editor (Options/Answers) */}
          <div className="space-y-8">
            <Card className="border-none shadow-md h-full sticky top-24">
              <CardHeader className="pb-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {questionType === 'mcq_single' ? <LayoutList className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                    <CardTitle className="text-lg">
                      {questionType === 'mcq_single' ? 'MCQ Options' : 'Accepted Answers'}
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                    {questionType === 'mcq_single' ? 'Multiple Choice' : 'Direct Text'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 h-full">
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
