'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'sonner';
import { parseQuestionFile, toBulkCreateQuestion, type ParsedBulkQuestion, type ParseError } from '@/lib/parsers/question-parser';
import { useBulkCreateQuestions, useCategories, useCheckDuplicates, useSyncQuestionsToStaging } from '@/hooks';
import type { BulkCreateQuestionsRequest, DuplicateQuestionInfo } from '@/types';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, AlertCircle, Trash2, Info, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn, getLocalizedText } from '@/lib/utils';
import { getDifficultyVariant } from '@/components/ui/difficulty-signal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TicTacToeGame } from '@/components/games/tic-tac-toe-game';
import { SnakeGame } from '@/components/games/snake-game';
import { Checkbox } from '@/components/ui/checkbox';
import { logger } from '@/lib/logger';
import {
  type DailyChallengeQuestionType,
  getDailyChallengeQuestionTypeForCategory,
} from '@/lib/daily-challenge-question-types';
import { preloadQuestionImage, QuestionImagePreview } from './question-image-preview';

type UploadQuestionType = DailyChallengeQuestionType;

type QuestionWithSelection = ParsedBulkQuestion & {
  id: string;
  isSelected: boolean;
  isDuplicate: boolean;
  duplicateInfo?: {
    existingQuestions: DuplicateQuestionInfo[];
  };
};

interface UploadState {
  file: File | null;
  parsedQuestions: ParsedBulkQuestion[];
  parseErrors: ParseError[];
  isUploading: boolean;
}

const TYPE_OPTIONS: Array<{ value: UploadQuestionType; label: string }> = [
  { value: 'mcq_single', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'countdown_list', label: 'Countdown' },
  { value: 'clue_chain', label: 'Who Am I' },
  { value: 'put_in_order', label: 'Put In Order' },
  { value: 'imposter_multi_select', label: 'Imposter' },
  { value: 'career_path', label: 'Career Path' },
  { value: 'high_low', label: 'High Low' },
  { value: 'football_logic', label: 'Football Logic' },
];

const FORMAT_EXAMPLES: Record<UploadQuestionType, string> = {
  mcq_single: `1. Question text here?
Image: https://example.com/question-image.png (optional)
A) Option 1
B) Option 2*
C) Option 3
D) Option 4
Difficulty: Easy
Explanation: Optional explanation text`,
  true_false: `1. Real Madrid has won more Champions League titles than any other club.
Answer: True
Difficulty: Easy
Explanation: Optional explanation`,
  countdown_list: `1. All the players who scored 50+ goals in Champions League
Cristiano Ronaldo | Ronaldo | CR7
Lionel Messi | Messi | Leo Messi
Robert Lewandowski | Lewandowski
Difficulty: Hard`,
  clue_chain: `1.
Clue 1: I started my career at Malmo BI before joining my hometown club Malmo FF.
Clue 2: I am the only player to have scored for six different clubs in the UEFA Champions League.
Answer: Zlatan Ibrahimovic | Zlatan Ibrahimović
Difficulty: Medium`,
  put_in_order: `1. Order these players by most Ballon d'Or wins (High to Low)
Direction: desc
Items:
- Cristiano Ronaldo
- Lionel Messi
- Michel Platini
- Zlatan Ibrahimovic
Answer:
1. Lionel Messi
2. Cristiano Ronaldo
3. Michel Platini
4. Zlatan Ibrahimovic
Difficulty: Easy`,
  imposter_multi_select: `1. Question: Which of these players have won the Ballon d'Or?
Lionel Messi
Andres Iniesta
Cristiano Ronaldo
Thierry Henry
Luka Modric
Karim Benzema
Correct Answers: Lionel Messi, Cristiano Ronaldo, Luka Modric, Karim Benzema
Difficulty: Medium`,
  career_path: `1. Question: AS Monaco ➔ Paris Saint-Germain ➔ Real Madrid
Answer: Kylian Mbappé | Kylian Mbappe | Mbappe
Difficulty: Easy`,
  high_low: `1. Question: Who has scored more all-time Premier League goals? (Winner stays on)
Stat Label: All-time Premier League goals
Matchup 1
Correct Answer: Michael Owen (150)
Wrong Answer: Robin van Persie (144)
Matchup 2
Correct Answer: Jermain Defoe (162)
Wrong Answer: Michael Owen (150)
Difficulty: Medium`,
  football_logic: `1. Prompt: Name the player from the visual logic
Image A: https://example.com/stopwatch-9-minutes.png
Image B: https://example.com/five-fingers.png
Answer: Robert Lewandowski | Lewandowski
Explanation: Famous Bundesliga match where he scored 5 goals in 9 minutes.
Difficulty: Hard`,
};

function getQuestionSummary(question: ParsedBulkQuestion): string {
  switch (question.kind) {
    case 'mcq_single':
    case 'true_false':
    case 'countdown_list':
    case 'put_in_order':
      return question.prompt;
    case 'clue_chain':
      return question.clues[0] || question.displayAnswer;
    case 'imposter_multi_select':
    case 'career_path':
    case 'high_low':
      return question.prompt;
    case 'football_logic':
      return question.prompt || question.displayAnswer;
  }
}

export function BulkUploadDialog() {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedQuestionType, setSelectedQuestionType] = useState<UploadQuestionType>('mcq_single');
  const [selectedLocale, setSelectedLocale] = useState<'en' | 'ka'>('en');
  const [syncToStaging, setSyncToStaging] = useState(false);
  const uploadInFlightRef = useRef(false);
  const [state, setState] = useState<UploadState>({
    file: null,
    parsedQuestions: [],
    parseErrors: [],
    isUploading: false,
  });
  const [questionsWithState, setQuestionsWithState] = useState<QuestionWithSelection[]>([]);
  const [uploadProgress, setUploadProgress] = useState({
    successful: 0,
    failed: 0,
    total: 0,
  });
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateCheckProgress, setDuplicateCheckProgress] = useState({
    checked: 0,
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestQuestionsRef = useRef<QuestionWithSelection[]>([]);
  const runDuplicateCheckRef = useRef<((questions: QuestionWithSelection[], locale: 'en' | 'ka') => Promise<void>) | null>(null);

  const { data: categories } = useCategories();
  const bulkCreate = useBulkCreateQuestions();
  const checkDuplicates = useCheckDuplicates();
  const syncQuestionsToStaging = useSyncQuestionsToStaging();
  const selectedCategoryObject = categories?.find((category) => category.id === selectedCategory);
  const inferredQuestionType = getDailyChallengeQuestionTypeForCategory(selectedCategoryObject);

  // Store stable function reference in ref to prevent useEffect re-triggers
  useEffect(() => {
    runDuplicateCheckRef.current = async (questions: QuestionWithSelection[], locale: 'en' | 'ka') => {
      setIsCheckingDuplicates(true);
      setDuplicateCheckProgress({ checked: 0, total: questions.length });

      try {
        const prompts = questions.map(q => ({ [locale]: getQuestionSummary(q) }));
        const duplicateResult = await checkDuplicates.mutateAsync({
          locale,
          prompts,
          onProgress: (checked, total) => {
            setDuplicateCheckProgress({ checked, total });
          },
        });

        // Mark duplicates and auto-deselect them
        const updated = questions.map((q, idx) => {
          const duplicate = duplicateResult.duplicates.find(d => d.index === idx);
          if (duplicate) {
            return {
              ...q,
              isDuplicate: true,
              isSelected: false, // Auto-deselect duplicates
              duplicateInfo: {
                existingQuestions: duplicate.existingQuestions,
              },
            };
          }
          return { ...q, isDuplicate: false, duplicateInfo: undefined };
        });

        setQuestionsWithState(updated);

        // Show summary
        const dupCount = duplicateResult.duplicates.length;
        if (dupCount > 0) {
          toast.warning(
            `Found ${dupCount} duplicate question${dupCount > 1 ? 's' : ''}. They are unselected by default.`
          );
        }
      } catch {
        toast.error('Failed to check for duplicates. You can still proceed with upload.');
        // Keep all questions selected on error
        setQuestionsWithState(prev =>
          prev.map(q => ({ ...q, isSelected: true, isDuplicate: false, duplicateInfo: undefined }))
        );
      } finally {
        setIsCheckingDuplicates(false);
      }
    };
  }, [checkDuplicates]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.txt')) {
      toast.error('Please select a .txt file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Read and parse file
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const numberedLines = content
        .split(/\r?\n/)
        .map((line, index) => ({ lineNumber: index + 1, text: line.trim() }))
        .filter((line) => /^\d+\.\s+/.test(line.text));

      logger.info('questions', 'Bulk upload parser starting', {
        fileName: file.name,
        selectedCategory,
        selectedCategorySlug: selectedCategoryObject?.slug,
        inferredQuestionType,
        selectedQuestionType,
        numberedLineCount: numberedLines.length,
        numberedLineSample: numberedLines.slice(0, 12),
      });

      const result = parseQuestionFile(content, selectedQuestionType);

      logger.info('questions', 'Bulk upload parser result', {
        fileName: file.name,
        selectedQuestionType,
        parsedQuestionCount: result.questions.length,
        parseErrorCount: result.errors.length,
        parseErrorSample: result.errors.slice(0, 10),
        parsedQuestionSample: result.questions.slice(0, 5).map((question) => ({
          kind: question.kind,
          questionNumber: question.questionNumber,
          lineNumber: question.lineNumber,
        })),
      });

      setState((prev) => ({
        ...prev,
        file,
        parsedQuestions: result.questions,
        parseErrors: result.errors,
      }));

      if (result.questions.length === 0) {
        toast.error('No valid questions found in file');
        return;
      }

      // Initialize with all questions selected
      const questionsWithSelection: QuestionWithSelection[] = result.questions.map((q, idx) => ({
        ...q,
        id: `${q.questionNumber}-${q.lineNumber}-${idx}`,
        isSelected: true,
        isDuplicate: false,
      }));

      setQuestionsWithState(questionsWithSelection);
      setPage(1);

      if (result.errors.length > 0) {
        const looksLikeOldPutInOrderParser = selectedQuestionType === 'put_in_order'
          && result.errors.some((error) => error.message.includes('Duplicate question number'));

        if (looksLikeOldPutInOrderParser) {
          logger.warn('questions', 'Put in Order parse failure looks like stale browser bundle or wrong parser type', {
            fileName: file.name,
            selectedCategorySlug: selectedCategoryObject?.slug,
            selectedQuestionType,
            parseErrorSample: result.errors.slice(0, 20),
          });
        }

        toast.warning(`Parsed ${result.questions.length} questions with ${result.errors.length} errors`);
      } else {
        toast.success(`Parsed ${result.questions.length} questions`);
      }

      // Check for duplicates
      await runDuplicateCheckRef.current?.(questionsWithSelection, selectedLocale);
    };

    reader.onerror = () => {
      toast.error('Failed to read file');
    };

    reader.readAsText(file);
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestionsWithState((prev) => {
      const removed = prev.find((q) => q.id === id);
      if (removed) {
        setState((statePrev) => ({
          ...statePrev,
          parsedQuestions: statePrev.parsedQuestions.filter(
            (q) => !(q.questionNumber === removed.questionNumber && q.lineNumber === removed.lineNumber)
          ),
        }));
      }
      return prev.filter((q) => q.id !== id);
    });
  };

  const handleUpload = async () => {
    if (uploadInFlightRef.current || state.isUploading || bulkCreate.isPending) {
      return;
    }

    const selectedQuestions = questionsWithState.filter(q => q.isSelected);

    if (selectedQuestions.length === 0) {
      toast.error('No questions selected for upload');
      return;
    }

    if (!selectedCategory) {
      toast.error('Please select a category');
      return;
    }

    uploadInFlightRef.current = true;
    setState((prev) => ({ ...prev, isUploading: true }));

    // Set initial progress
    setUploadProgress({
      successful: 0,
      failed: 0,
      total: selectedQuestions.length,
    });

    try {
      const questions: BulkCreateQuestionsRequest['questions'] = selectedQuestions.map((q) =>
        toBulkCreateQuestion(q, selectedLocale)
      );

      const result = await bulkCreate.mutateAsync({
        category_id: selectedCategory,
        questions,
      });

      // Update progress with results
      setUploadProgress({
        successful: result.successful,
        failed: result.failed,
        total: result.total,
      });

      if (syncToStaging && result.created.length > 0) {
        try {
          await syncQuestionsToStaging.mutateAsync({
            question_ids: result.created.map((question) => question.id),
          });
        } catch {
          // Upload succeeded; staging sync error is handled by useSyncQuestionsToStaging.
        }
      }

      // Small delay to show completion message
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Close dialog and reset state
      handleClose();
    } catch {
      // Error is handled in the mutation
      setState((prev) => ({ ...prev, isUploading: false }));
      setUploadProgress({
        successful: 0,
        failed: 0,
        total: 0,
      });
    } finally {
      uploadInFlightRef.current = false;
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const category = categories?.find((item) => item.id === categoryId);
    const nextQuestionType = getDailyChallengeQuestionTypeForCategory(category);
    if (nextQuestionType) {
      setSelectedQuestionType(nextQuestionType);
    }
  };

  const handleClose = () => {
    uploadInFlightRef.current = false;
    setOpen(false);
    setTimeout(() => {
      setState({
        file: null,
        parsedQuestions: [],
        parseErrors: [],
        isUploading: false,
      });
      setQuestionsWithState([]);
      setUploadProgress({
        successful: 0,
        failed: 0,
        total: 0,
      });
      setDuplicateCheckProgress({
        checked: 0,
        total: 0,
      });
      setIsCheckingDuplicates(false);
      setSelectedCategory('');
      setSelectedQuestionType('mcq_single');
      setSyncToStaging(false);
      setPage(1);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 200);
  };

  // Computed values
  const selectedCount = questionsWithState.filter(q => q.isSelected).length;
  const duplicateCount = questionsWithState.filter(q => q.isDuplicate).length;
  const canUpload = selectedCategory && selectedCount > 0 && !state.isUploading && !bulkCreate.isPending && !isCheckingDuplicates;
  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(questionsWithState.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageQuestions = questionsWithState.slice(pageStart, pageStart + pageSize);
  const previewImageUrls = useMemo(
    () => questionsWithState.map((question) =>
      question.kind === 'mcq_single' ? question.imageUrl : undefined
    ),
    [questionsWithState]
  );

  useEffect(() => {
    latestQuestionsRef.current = questionsWithState;
  }, [questionsWithState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      previewImageUrls.slice(0, 6).forEach((url) => {
        preloadQuestionImage(url);
      });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [previewImageUrls]);

  // Re-check duplicates only when locale changes
  useEffect(() => {
    if (latestQuestionsRef.current.length === 0) return;
    void runDuplicateCheckRef.current?.(latestQuestionsRef.current, selectedLocale);
  }, [selectedLocale]); // No runDuplicateCheck dependency - use ref to avoid multiple calls

  useEffect(() => {
    setState({
      file: null,
      parsedQuestions: [],
      parseErrors: [],
      isUploading: false,
    });
    setQuestionsWithState([]);
    setUploadProgress({
      successful: 0,
      failed: 0,
      total: 0,
    });
    setDuplicateCheckProgress({
      checked: 0,
      total: 0,
    });
    setIsCheckingDuplicates(false);
    setPreviewIndex(null);
    setPage(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedQuestionType]);

  useEffect(() => {
    if (inferredQuestionType && selectedQuestionType !== inferredQuestionType) {
      setSelectedQuestionType(inferredQuestionType);
    }
  }, [inferredQuestionType, selectedQuestionType]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Upload Questions
        </Button>
      </DialogTrigger>
      <DialogContent
        className="!max-w-6xl overflow-hidden flex flex-col p-6"
        style={{ maxHeight: '95vh', height: '95vh' }}
      >
        <DialogHeader className="flex-shrink-0 pb-4">
          <DialogTitle>Bulk Upload Questions</DialogTitle>
          <DialogDescription>
            {state.isUploading
              ? `Creating questions: ${uploadProgress.successful + uploadProgress.failed} / ${uploadProgress.total}${uploadProgress.failed > 0 ? ` (${uploadProgress.failed} failed)` : ''}`
              : isCheckingDuplicates
              ? `Checking for duplicates: ${duplicateCheckProgress.checked} / ${duplicateCheckProgress.total} questions`
              : 'Upload a .txt file with multiple questions to create them all at once. Maximum 500 questions per upload.'
            }
          </DialogDescription>
        </DialogHeader>

        {state.isUploading ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <TicTacToeGame
              uploadProgress={uploadProgress}
              className="mt-4"
            />
          </div>
        ) : isCheckingDuplicates ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <SnakeGame
              checkProgress={duplicateCheckProgress}
              className="mt-4"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={selectedCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories && categories.length > 0 ? (
                  categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {getLocalizedText(cat.name)}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="" disabled>
                    {categories ? 'No categories available' : 'Loading categories...'}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="question-type">Question Type *</Label>
              <Select
                value={selectedQuestionType}
                onValueChange={(value: UploadQuestionType) => setSelectedQuestionType(value)}
                disabled={Boolean(inferredQuestionType)}
              >
                <SelectTrigger id="question-type">
                  <SelectValue placeholder="Select a question type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {inferredQuestionType
                  ? `Auto-selected from the "${getLocalizedText(selectedCategoryObject?.name)}" daily challenge category.`
                  : 'Controls the parser and saved question payload.'}
              </p>
            </div>

            {/* File Input */}
            <div className="space-y-2">
              <Label htmlFor="file">Question File *</Label>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".txt"
                onChange={handleFileSelect}
              />
              <p className="text-sm text-muted-foreground">
                Upload a .txt file (max 5MB)
              </p>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <Label htmlFor="locale">File Language *</Label>
              <Select value={selectedLocale} onValueChange={(value: 'en' | 'ka') => setSelectedLocale(value)}>
                <SelectTrigger id="locale">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ka">Georgian (KA)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Used for duplicate checks and stored prompt locale.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border bg-white p-3">
            <Checkbox
              checked={syncToStaging}
              onCheckedChange={(checked) => setSyncToStaging(Boolean(checked))}
              disabled={state.isUploading || syncQuestionsToStaging.isPending}
              className="mt-0.5"
            />
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-slate-900">Sync created questions to staging</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                After the upload succeeds, copy the new questions and payloads into the staging database.
              </span>
            </span>
          </label>

          {/* Format Instructions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="flex-1 space-y-3">
                  <h4 className="font-semibold text-base">File Format</h4>
                  <div className="text-sm space-y-3">
                    <div>
                      <p className="font-medium mb-2">Required format for each question:</p>
                      <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto border border-border">
{FORMAT_EXAMPLES[selectedQuestionType]}
                      </pre>
                    </div>

                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parse Errors */}
          {state.parseErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">
                  Found {state.parseErrors.length} error(s) in file:
                </div>
                {selectedQuestionType === 'put_in_order' && state.parseErrors.some((err) => err.message.includes('Duplicate question number')) && (
                  <p className="mb-2 text-sm">
                    This duplicate-number pattern usually means the browser is still using an old parser bundle.
                    Hard refresh the CMS page and retry this upload.
                  </p>
                )}
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {state.parseErrors.slice(0, 5).map((err, i) => (
                    <li key={i}>
                      Line {err.lineNumber}
                      {err.questionNumber && ` (Question ${err.questionNumber})`}: {err.message}
                    </li>
                  ))}
                  {state.parseErrors.length > 5 && (
                    <li>...and {state.parseErrors.length - 5} more errors</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Summary Alert */}
          {questionsWithState.length > 0 && (
            <Alert className={cn(
              "flex items-start justify-between gap-4",
              duplicateCount > 0 ? 'border-amber-500 bg-amber-50' : 'border-green-500 bg-green-50'
            )}>
              <div className="flex-1">
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {selectedCount} question{selectedCount !== 1 ? 's' : ''} selected for upload
                    </p>
                    {duplicateCount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} found and unselected
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </div>
              {duplicateCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setQuestionsWithState(prev =>
                      prev.map(q => ({ ...q, isSelected: true }))
                    );
                  }}
                >
                  Select All Anyway
                </Button>
              )}
            </Alert>
          )}

          {/* Preview Table */}
          {questionsWithState.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Parsed Questions ({questionsWithState.length})
                </Label>
                {questionsWithState.length > 500 && (
                  <Badge variant="destructive">
                    Maximum 500 questions allowed
                  </Badge>
                )}
              </div>
              <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        {(() => {
                          const allSelected = questionsWithState.every(q => q.isSelected);
                          const someSelected = questionsWithState.some(q => q.isSelected);
                          return (
                            <Checkbox
                              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                              onCheckedChange={(checked: boolean | 'indeterminate') => {
                                setQuestionsWithState(prev =>
                                  prev.map(q => ({ ...q, isSelected: checked === true }))
                                );
                              }}
                            />
                          );
                        })()}
                      </TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead className="w-24">Difficulty</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageQuestions.map((q, rowIndex) => (
                      <TableRow
                        key={q.id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/50',
                          !q.isSelected && 'opacity-50'
                        )}
                        onClick={() => setPreviewIndex(pageStart + rowIndex)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={q.isSelected}
                            onCheckedChange={(checked: boolean | 'indeterminate') => {
                              setQuestionsWithState(prev =>
                                prev.map((item) =>
                                  item.id === q.id ? { ...item, isSelected: checked === true } : item
                                )
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{q.questionNumber}</TableCell>
                        <TableCell className="max-w-md truncate">{getQuestionSummary(q)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{q.difficulty}</Badge>
                        </TableCell>
                        <TableCell>
                          {q.isDuplicate ? (
                            <div className="space-y-1">
                              <Badge variant="destructive" className="text-xs">
                                Duplicate
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                Exists in {q.duplicateInfo?.existingQuestions[0]?.category_name?.en || 'Unknown'}
                              </p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              New
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveQuestion(q.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        )}

        {/* Question Preview Dialog */}
        {previewIndex !== null && questionsWithState[previewIndex] && (
          <ParsedQuestionPreviewDialog
            question={questionsWithState[previewIndex]}
            currentIndex={previewIndex}
            totalQuestions={questionsWithState.length}
            imageUrls={previewImageUrls}
            onClose={() => setPreviewIndex(null)}
            onNavigate={setPreviewIndex}
          />
        )}

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
          <Button variant="outline" onClick={handleClose} disabled={state.isUploading || isCheckingDuplicates}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!canUpload || selectedCount > 500 || syncQuestionsToStaging.isPending}
          >
            {syncQuestionsToStaging.isPending ? (
              <>Syncing to staging...</>
            ) : state.isUploading ? (
              <>Uploading...</>
            ) : (
              <>Upload {selectedCount} Question{selectedCount !== 1 ? 's' : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ParsedQuestionPreviewDialogProps {
  question: QuestionWithSelection;
  currentIndex: number;
  totalQuestions: number;
  imageUrls: Array<string | undefined>;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function ParsedQuestionPreviewDialog({
  question,
  currentIndex,
  totalQuestions,
  imageUrls,
  onClose,
  onNavigate,
}: ParsedQuestionPreviewDialogProps) {
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalQuestions - 1;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        onNavigate(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNavigate(currentIndex + 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, hasPrevious, hasNext, onNavigate, onClose]);

  useEffect(() => {
    const indexesToPreload = [
      currentIndex,
      currentIndex + 1,
      currentIndex + 2,
      currentIndex + 3,
      currentIndex - 1,
    ];
    const timer = window.setTimeout(() => {
      indexesToPreload.forEach((index) => {
        preloadQuestionImage(imageUrls[index]);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentIndex, imageUrls]);

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="flex max-h-[92vh] w-[min(92vw,760px)] max-w-none flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <div className="flex items-center justify-between">
            <DialogTitle>Question Preview</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} of {totalQuestions}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!hasPrevious}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasPrevious) onNavigate(currentIndex - 1);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!hasNext}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasNext) onNavigate(currentIndex + 1);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-4">
          {/* Header with badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('border', getDifficultyVariant(question.difficulty))}>
              {question.difficulty}
            </Badge>
            <Badge variant="outline">{question.kind}</Badge>
            {question.isDuplicate ? (
              <Badge variant="destructive">Duplicate</Badge>
            ) : (
              <Badge variant="outline" className="text-green-600 border-green-600">New</Badge>
            )}
            {question.isSelected ? (
              <Badge variant="default">Selected</Badge>
            ) : (
              <Badge variant="secondary">Not Selected</Badge>
            )}
          </div>

          {/* Question Prompt */}
          <div>
            <Label className="text-xs text-muted-foreground">Question #{question.questionNumber}</Label>
            <p className="text-sm font-medium mt-1">{getQuestionSummary(question)}</p>
          </div>

          {question.kind === 'mcq_single' && (
            <>
              {question.imageUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground">Image</Label>
                  <QuestionImagePreview
                    src={question.imageUrl}
                    alt={`Question ${question.questionNumber} image`}
                    sourceUrl={question.imageUrl}
                    compact
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Options</Label>
                <div className="space-y-2 mt-1">
                  {question.options.map((option, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex min-w-0 items-center gap-2 rounded-lg border p-3 text-sm',
                        option.is_correct
                          ? 'bg-green-50 border-green-200'
                          : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      <span className="font-semibold">{String.fromCharCode(65 + index)})</span>
                      <span className="min-w-0 flex-1 break-words">{option.text}</span>
                      {option.is_correct && <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {question.kind === 'true_false' && (
            <div>
              <Label className="text-xs text-muted-foreground">Correct Answer</Label>
              <div className="mt-1 rounded-lg border bg-gray-50 p-3 text-sm font-medium">
                {question.answer ? 'True' : 'False'}
              </div>
            </div>
          )}

          {question.kind === 'countdown_list' && (
            <div>
              <Label className="text-xs text-muted-foreground">Accepted Answers ({question.answers.length})</Label>
              <div className="space-y-2 mt-1">
                {question.answers.map((answer, index) => (
                  <div key={index} className="rounded-lg border bg-gray-50 p-3 text-sm">
                    <div className="font-medium">{answer.display}</div>
                    <div className="text-xs text-muted-foreground mt-1">{answer.aliases.join(' | ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {question.kind === 'clue_chain' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Clues ({question.clues.length})</Label>
                <div className="space-y-2 mt-1">
                  {question.clues.map((clue, index) => (
                    <div key={index} className="rounded-lg border bg-gray-50 p-3 text-sm">
                      <span className="font-medium">Clue {index + 1}:</span> {clue}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Accepted Answers</Label>
                <p className="text-sm mt-1">{question.acceptedAnswers.join(' | ')}</p>
              </div>
            </>
          )}

          {question.kind === 'put_in_order' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Direction</Label>
                <p className="text-sm mt-1">{question.direction}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Items</Label>
                <div className="space-y-2 mt-1">
                  {question.items.map((item, index) => (
                    <div key={index} className="rounded-lg border bg-gray-50 p-3 text-sm">{item}</div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Correct Order</Label>
                <div className="space-y-2 mt-1">
                  {question.orderedAnswer.map((item, index) => (
                    <div key={index} className="rounded-lg border bg-green-50 p-3 text-sm">
                      {index + 1}. {item}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Explanation */}
          {question.explanation && (
            <div>
              <Label className="text-xs text-muted-foreground">Explanation</Label>
              <p className="text-sm text-muted-foreground mt-1">{question.explanation}</p>
            </div>
          )}

          {/* Duplicate Info */}
          {question.isDuplicate && question.duplicateInfo && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">This question already exists:</p>
                <p className="text-sm mt-1">
                  Category: {question.duplicateInfo.existingQuestions[0]?.category_name?.en || 'Unknown'}
                </p>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
