'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { parseQuestionFile, type ParsedQuestion, type ParseError } from '@/lib/parsers/question-parser';
import { useBulkCreateQuestions, useCategories, useCheckDuplicates } from '@/hooks';
import type { BulkCreateQuestionsRequest, McqPayload, DuplicateQuestionInfo } from '@/types';
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
import { Upload, AlertCircle, Trash2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateAnswerId } from '@/lib/question-utils';
import { Badge } from '@/components/ui/badge';
import { getLocalizedText } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { TicTacToeGame } from '@/components/games/tic-tac-toe-game';
import { Checkbox } from '@/components/ui/checkbox';

interface QuestionWithSelection extends ParsedQuestion {
  isSelected: boolean;
  isDuplicate: boolean;
  duplicateInfo?: {
    existingQuestions: DuplicateQuestionInfo[];
  };
}

interface UploadState {
  file: File | null;
  parsedQuestions: ParsedQuestion[];
  parseErrors: ParseError[];
  isUploading: boolean;
}

export function BulkUploadDialog() {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedLocale, setSelectedLocale] = useState<'en' | 'ka'>('en');
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: categories } = useCategories();
  const bulkCreate = useBulkCreateQuestions();
  const checkDuplicates = useCheckDuplicates();

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
      const result = parseQuestionFile(content);

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
      const questionsWithSelection: QuestionWithSelection[] = result.questions.map(q => ({
        ...q,
        isSelected: true,
        isDuplicate: false,
      }));

      setQuestionsWithState(questionsWithSelection);

      if (result.errors.length > 0) {
        toast.warning(`Parsed ${result.questions.length} questions with ${result.errors.length} errors`);
      } else {
        toast.success(`Parsed ${result.questions.length} questions`);
      }

      // Check for duplicates
      try {
        const prompts = result.questions.map(q => ({ [selectedLocale]: q.prompt }));
        const duplicateResult = await checkDuplicates.mutateAsync({
          locale: selectedLocale,
          prompts,
        });

        // Mark duplicates and auto-deselect them
        const updated = questionsWithSelection.map((q, idx) => {
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
          return q;
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
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read file');
    };

    reader.readAsText(file);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestionsWithState((prev) => prev.filter((_, i) => i !== index));
    setState((prev) => ({
      ...prev,
      parsedQuestions: prev.parsedQuestions.filter((_, i) => i !== index),
    }));
  };

  const handleUpload = async () => {
    const selectedQuestions = questionsWithState.filter(q => q.isSelected);

    if (selectedQuestions.length === 0) {
      toast.error('No questions selected for upload');
      return;
    }

    if (!selectedCategory) {
      toast.error('Please select a category');
      return;
    }

    setState((prev) => ({ ...prev, isUploading: true }));

    // Set initial progress
    setUploadProgress({
      successful: 0,
      failed: 0,
      total: selectedQuestions.length,
    });

    try {
      // Convert only selected questions to API request format
      const questions: BulkCreateQuestionsRequest['questions'] = selectedQuestions.map((q) => ({
        type: 'mcq_single',
        difficulty: q.difficulty,
        status: 'draft',
        prompt: { [selectedLocale]: q.prompt },
        explanation: q.explanation ? { [selectedLocale]: q.explanation } : null,
        payload: {
          type: 'mcq_single',
          options: q.options.map((opt) => ({
            id: generateAnswerId(),
            text: { [selectedLocale]: opt.text },
            is_correct: opt.is_correct,
          })),
        } as McqPayload,
      }));

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

      // Small delay to show completion message
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Close dialog and reset state
      handleClose();
    } catch {
      // Error is handled in the mutation
      setState((prev) => ({ ...prev, isUploading: false }));
    }
  };

  const handleClose = () => {
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
      setSelectedCategory('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 200);
  };

  // Computed values
  const selectedCount = questionsWithState.filter(q => q.isSelected).length;
  const duplicateCount = questionsWithState.filter(q => q.isDuplicate).length;
  const canUpload = selectedCategory && selectedCount > 0 && !state.isUploading;

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
              : 'Upload a .txt file with multiple questions to create them all at once. Maximum 100 questions per upload.'
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
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {getLocalizedText(cat.name)}
                  </SelectItem>
                )) || <SelectItem value="" disabled>Loading categories...</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
{`1. Question text here?
A) Option 1
B) Option 2*
C) Option 3
D) Option 4
Difficulty: Easy
Explanation: Optional explanation text

2. Next question text?
A) Option 1
B) Option 2
C) Option 3*
D) Option 4
Difficulty: Medium`}
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
                <Label className="text-base font-semibold">Parsed Questions ({questionsWithState.length})</Label>
                {questionsWithState.length > 100 && (
                  <Badge variant="destructive">
                    Maximum 100 questions allowed
                  </Badge>
                )}
              </div>
              <div className="border rounded-lg max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={questionsWithState.every(q => q.isSelected)}
                          onCheckedChange={(checked: boolean | 'indeterminate') => {
                            setQuestionsWithState(prev =>
                              prev.map(q => ({ ...q, isSelected: checked === true }))
                            );
                          }}
                        />
                      </TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead className="w-24">Difficulty</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questionsWithState.slice(0, 100).map((q, index) => (
                      <TableRow key={index} className={cn(!q.isSelected && 'opacity-50')}>
                        <TableCell>
                          <Checkbox
                            checked={q.isSelected}
                            onCheckedChange={(checked: boolean | 'indeterminate') => {
                              setQuestionsWithState(prev =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, isSelected: checked === true } : item
                                )
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{q.questionNumber}</TableCell>
                        <TableCell className="max-w-md truncate">{q.prompt}</TableCell>
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
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveQuestion(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          </div>
        )}

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
          <Button variant="outline" onClick={handleClose} disabled={state.isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!canUpload || selectedCount > 100}
          >
            {state.isUploading ? (
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
