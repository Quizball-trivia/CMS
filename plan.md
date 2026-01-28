# CMS Code Quality Improvements - Implementation Plan

## Overview

This document outlines the systematic improvements to the CMS codebase based on the code quality review. Changes are organized by priority and estimated effort.

**Total Estimated Time**: 5.5-6 hours (plus 1-2 hours buffer for testing and unexpected issues)
**Risk Level**: Low to Medium (most changes preserve behavior, some require careful ID handling)

---

## Phase 1: High-Impact Quick Wins (1-2 hours)

### 1.1 Extract Duplicated DifficultySignal Component

**Effort**: 15 minutes
**Impact**: Removes duplication, improves consistency
**Risk**: Very Low

#### Current State
- `DifficultySignal` component is duplicated in:
  - `/Users/user/dev/quizball/cms/src/components/questions/question-dialog.tsx` (lines 204-219)
  - `/Users/user/dev/quizball/cms/src/components/questions/question-list.tsx` (lines 237-254)

#### Implementation Steps

1. **Create new shared component**: `/Users/user/dev/quizball/cms/src/components/ui/difficulty-signal.tsx`

```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

interface DifficultySignalProps {
  difficulty: 'easy' | 'medium' | 'hard';
  className?: string;
}

export function DifficultySignal({ difficulty, className }: DifficultySignalProps) {
  const DOTS_MAP: Record<DifficultySignalProps['difficulty'], number> = {
    easy: 1,
    medium: 2,
    hard: 3,
  };
  const COLOR_MAP: Record<DifficultySignalProps['difficulty'], string> = {
    easy: 'bg-emerald-500',
    medium: 'bg-amber-500',
    hard: 'bg-rose-500',
  };
  const dots = DOTS_MAP[difficulty] ?? 1;
  const color = COLOR_MAP[difficulty] ?? 'bg-emerald-500';

  return (
    <div className={cn("flex gap-1", className)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-2 rounded-full transition-all",
            i < dots ? color : "bg-slate-200"
          )}
        />
      ))}
    </div>
  );
}

export function getDifficultyVariant(difficulty: string): 'default' | 'secondary' | 'destructive' {
  switch (difficulty) {
    case 'easy':
      return 'secondary';
    case 'medium':
      return 'default';
    case 'hard':
      return 'destructive';
    default:
      return 'default';
  }
}
```

2. **Update question-dialog.tsx**:
   - Add import: `import { DifficultySignal, getDifficultyVariant } from '@/components/ui/difficulty-signal';`
   - Remove lines 204-233 (local DifficultySignal and getDifficultyVariant)
   - Keep existing usage (no changes needed)

3. **Update question-list.tsx**:
   - Add import: `import { DifficultySignal, getDifficultyVariant } from '@/components/ui/difficulty-signal';`
   - Remove lines 237-254 (local implementations)
   - Keep existing usage (no changes needed)

#### Verification
- [ ] Open questions list - difficulty indicators display correctly
- [ ] Open question dialog - difficulty indicators display correctly
- [ ] Both should look identical
- [ ] Run: `npm run lint` - no errors

---

### 1.2 Extract questionToFormData Function

**Effort**: 30 minutes
**Impact**: Removes 30+ lines of duplication, improves testability
**Risk**: Low (requires careful locale and type handling)

#### Current State
- Form data transformation logic duplicated in:
  - `question-dialog.tsx` lines 123-153 (`handleOpenChange`)
  - `question-dialog.tsx` lines 249-281 (`handleEdit`)

#### Implementation Steps

0. **Update `AnswerWithId`** to preserve all locales (e.g., `id?: string; text: Record<string, string>`).

1. **Create utility function** in `/Users/user/dev/quizball/cms/src/lib/question-utils.ts`:

```typescript
import type { Question, QuestionStatus } from '@/types';
import type { AnswerWithId } from '@/components/questions/text-input-editor';

export interface QuestionFormData {
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
}

export function questionToFormData(question: Question, preferredLocale: 'en' | 'ka' = 'en'): QuestionFormData {
  // Use preferred locale if available, otherwise use first available locale, fallback to 'en'
  const availableLocales = Object.keys(question.prompt || {});
  const locale = availableLocales.includes(preferredLocale)
    ? preferredLocale
    : (availableLocales[0] as 'en' | 'ka') || 'en';

  const baseData = {
    category_id: question.category_id,
    locale,
    difficulty: question.difficulty,
    status: question.status,
    type: question.type,
    prompt: question.prompt?.[locale] || '',
    explanation: question.explanation?.[locale] || '',
    caseSensitive: false,
  };

  if (question.type === 'mcq_single') {
    const payload = question.payload as { options?: Array<{ id: string; text: Record<string, string>; is_correct: boolean }> };
    return {
      ...baseData,
      options: payload.options?.map(opt => ({
        id: opt.id, // Preserve ID for updates
        text: opt.text?.[locale] || '',
        is_correct: opt.is_correct
      })) || [],
      acceptedAnswers: [],
    };
  } else if (question.type === 'input_text') {
    const payload = question.payload as {
      accepted_answers?: Array<{ id: string; text: Record<string, string> }>;
      case_sensitive?: boolean;
    };
    return {
      ...baseData,
      options: [],
      acceptedAnswers: payload.accepted_answers?.map(ans => ({
        id: ans.id, // Preserve existing IDs
        text: ans.text || {}
      })) || [],
      caseSensitive: payload.case_sensitive || false,
    };
  }

  // Fallback (shouldn't happen with valid data)
  return {
    ...baseData,
    options: [],
    acceptedAnswers: [],
  };
}

// Helper to generate client-side IDs (only call from client components)
export function generateAnswerId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers or server-side (shouldn't happen in practice)
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
```

2. **Update question-dialog.tsx**:
   - Add import: `import { questionToFormData, generateAnswerId, type QuestionFormData } from '@/lib/question-utils';`
   - In `handleOpenChange` (lines 123-153), replace transformation logic with:
     ```typescript
     if (displayQuestion) {
       setFormData(questionToFormData(displayQuestion, 'en')); // Pass current locale
     }
     ```
   - In `handleEdit` (lines 249-281), replace transformation logic with:
     ```typescript
     setFormData(questionToFormData(displayQuestion, formData.locale)); // Use current locale
     setMode('edit');
     ```
   - Update formData type declaration to use imported type
   - Replace all `crypto.randomUUID()` calls with `generateAnswerId()`

#### Verification
- [ ] Open question in view mode - data displays correctly
- [ ] Click Edit - form populates correctly
- [ ] Test with MCQ question type
- [ ] Test with Text Input question type
- [ ] Run: `npm run lint` - no errors
- [ ] Add unit test for `questionToFormData` (optional but recommended)

---

### 1.3 Add API Request Timeouts

**Effort**: 45 minutes
**Impact**: Prevents hanging requests, improves UX
**Risk**: Low (requires proper cleanup and signal composition)

#### Current State
- API client has no timeout configuration
- Requests can hang indefinitely
- Located in: `/Users/user/dev/quizball/cms/src/services/api-client.ts`

#### Implementation Steps

1. **Add timeout constant** at top of file:
```typescript
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
```

2. **Create timeout helper function** with proper cleanup and signal composition:
```typescript
function createTimeoutController(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  existingSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  // If existing signal is already aborted, abort immediately
  if (existingSignal?.aborted) {
    controller.abort();
  }

  // Set up timeout
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If existing signal is provided, listen for its abort
  const abortHandler = () => controller.abort();
  existingSignal?.addEventListener('abort', abortHandler);

  // Cleanup function to clear timeout and listeners
  const cleanup = () => {
    clearTimeout(timeoutId);
    existingSignal?.removeEventListener('abort', abortHandler);
  };

  return { signal: controller.signal, cleanup };
}
```

3. **Update all HTTP methods** to include timeout:

**get method** (lines ~79-92):
```typescript
async get<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal
): Promise<T> {
  const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

  try {
    const response = await fetch(buildUrl(endpoint, params), {
      method: 'GET',
      headers: getHeaders(),
      signal: timeoutSignal,
    });
    return await handleResponse<T>(response);
  } finally {
    cleanup();
  }
}
```

**post method** (lines ~94-105):
```typescript
async post<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

  try {
    const response = await fetch(buildUrl(endpoint), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: timeoutSignal,
    });
    return await handleResponse<T>(response);
  } finally {
    cleanup();
  }
}
```

**put method** (lines ~107-118):
```typescript
async put<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

  try {
    const response = await fetch(buildUrl(endpoint), {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: timeoutSignal,
    });
    return await handleResponse<T>(response);
  } finally {
    cleanup();
  }
}
```

**delete method** (lines ~120-131):
```typescript
async delete<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const { signal: timeoutSignal, cleanup } = createTimeoutController(DEFAULT_TIMEOUT_MS, signal);

  try {
    const response = await fetch(buildUrl(endpoint), {
      method: 'DELETE',
      headers: getHeaders(),
      signal: timeoutSignal,
    });
    return await handleResponse<T>(response);
  } finally {
    cleanup();
  }
}
```

4. **Update error handling** in `handleResponse`:
```typescript
private static async handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));

    const error = new ApiClientError(
      errorBody.message || `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      errorBody.code,
      errorBody.request_id,
      errorBody.details
    );

    throw error;
  }

  return response.json();
}
```

5. **Handle AbortError** in catch blocks where needed:
```typescript
// In components that use the API
try {
  await api.get('/endpoint');
} catch (error) {
  if (error.name === 'AbortError') {
    toast.error('Request timed out. Please try again.');
  } else {
    toast.error('An error occurred');
  }
}
```

#### Verification
- [ ] Test normal API requests still work
- [ ] Simulate slow backend (add `setTimeout` in backend endpoint) to verify timeout fires
- [ ] Verify timeout error shows user-friendly message
- [ ] Run: `npm run lint` - no errors

---

## Phase 2: Medium-Term Improvements (4-6 hours)

### 2.1 Extract useQuestionForm Hook

**Effort**: 2.5 hours
**Impact**: Significantly improves testability, reduces component complexity
**Risk**: Medium (complex refactor, requires careful ID preservation for updates)

#### Current State
- QuestionDialog component is 857 lines
- Form state, validation, and payload building are embedded
- Difficult to test form logic without rendering entire component

#### Implementation Steps

1. **Create new hook file**: `/Users/user/dev/quizball/cms/src/hooks/use-question-form.ts`

```typescript
import { useState } from 'react';
import type { Question, QuestionStatus, CreateQuestionRequest, UpdateQuestionRequest } from '@/types';
import type { AnswerWithId } from '@/components/questions/text-input-editor';
import { questionToFormData, type QuestionFormData } from '@/lib/question-utils';

type FormMode = 'view' | 'edit' | 'create';

interface UseQuestionFormOptions {
  mode: FormMode;
  question?: Question;
  defaultCategoryId?: string;
}

export function useQuestionForm({ mode, question, defaultCategoryId }: UseQuestionFormOptions) {
  const [formData, setFormData] = useState<QuestionFormData>(() => {
    if (question && mode !== 'create') {
      return questionToFormData(question);
    }

    // Default new question state
    return {
      category_id: defaultCategoryId || '',
      locale: 'en',
      difficulty: 'easy',
      status: 'draft',
      type: 'mcq_single',
      prompt: '',
      explanation: '',
      options: [
        { text: '', is_correct: true },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ],
      acceptedAnswers: [],
      caseSensitive: false,
    };
  });

  const validate = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!formData.category_id) {
      errors.push('Category is required');
    }

    if (!formData.prompt.trim()) {
      errors.push('Question prompt is required');
    }

    if (formData.type === 'mcq_single') {
      const hasCorrectAnswer = formData.options.some(opt => opt.is_correct);
      if (!hasCorrectAnswer) {
        errors.push('At least one option must be marked as correct');
      }

      const hasEmptyOptions = formData.options.some(opt => !opt.text.trim());
      if (hasEmptyOptions) {
        errors.push('All options must have text');
      }
    } else if (formData.type === 'input_text') {
      const hasEmptyAnswers = formData.acceptedAnswers.some(ans => !ans.en.trim());
      if (hasEmptyAnswers) {
        errors.push('All accepted answers must have text');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  const buildCreatePayload = (): CreateQuestionRequest => {
    // Import generateAnswerId at top of file
    // For create, generate new IDs
    return {
      category_id: formData.category_id,
      type: formData.type,
      difficulty: formData.difficulty,
      status: formData.status,
      prompt: { [formData.locale]: formData.prompt },
      explanation: formData.explanation ? { [formData.locale]: formData.explanation } : null,
      payload:
        formData.type === 'mcq_single'
          ? {
              type: 'mcq_single',
              options: formData.options.map(opt => ({
                id: generateAnswerId(), // Generate new IDs for create
                text: { [formData.locale]: opt.text },
                is_correct: opt.is_correct,
              })),
            }
          : {
              type: 'input_text',
              accepted_answers: formData.acceptedAnswers.map(ans => ({
                id: ans.id || generateAnswerId(), // Use existing or generate new
                text: { [formData.locale]: ans.en },
              })),
              case_sensitive: formData.caseSensitive,
            },
    };
  };

  const buildUpdatePayload = (): UpdateQuestionRequest => {
    // For updates, preserve existing IDs from form data
    return {
      category_id: formData.category_id,
      difficulty: formData.difficulty,
      status: formData.status,
      prompt: { [formData.locale]: formData.prompt },
      explanation: formData.explanation ? { [formData.locale]: formData.explanation } : null,
      payload:
        formData.type === 'mcq_single'
          ? {
              type: 'mcq_single',
              options: formData.options.map((opt, index) => ({
                // Preserve existing IDs if available (from loaded question)
                // This requires storing the original option ID in formData
                id: opt.id || generateAnswerId(),
                text: { [formData.locale]: opt.text },
                is_correct: opt.is_correct,
              })),
            }
          : {
              type: 'input_text',
              accepted_answers: formData.acceptedAnswers.map(ans => ({
                id: ans.id, // Preserve existing IDs
                text: { [formData.locale]: ans.en },
              })),
              case_sensitive: formData.caseSensitive,
            },
    };
  };

  const reset = (newQuestion?: Question) => {
    if (newQuestion) {
      setFormData(questionToFormData(newQuestion));
    } else {
      setFormData({
        category_id: defaultCategoryId || '',
        locale: 'en',
        difficulty: 'easy',
        status: 'draft',
        type: 'mcq_single',
        prompt: '',
        explanation: '',
        options: [
          { text: '', is_correct: true },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
        ],
        acceptedAnswers: [{ id: generateAnswerId(), en: '' }],
        caseSensitive: false,
      });
    }
  };

  return {
    formData,
    setFormData,
    validate,
    buildCreatePayload,
    buildUpdatePayload,
    reset,
  };
}
```

2. **Update question-dialog.tsx**:
   - Add import: `import { useQuestionForm } from '@/hooks/use-question-form';`
   - Replace formData state with hook:
     ```typescript
     const {
       formData,
       setFormData,
       validate,
       buildCreatePayload,
       buildUpdatePayload,
       reset,
     } = useQuestionForm({
       mode,
       question: displayQuestion,
       defaultCategoryId: undefined,
     });
     ```
   - Remove old formData useState (lines ~89-111)
   - Remove buildCreatePayload function (lines ~313-344)
   - Update handleSave to use validate() from hook
   - Update handleOpenChange to use reset() when opening

3. **Create unit tests**: `/Users/user/dev/quizball/cms/src/hooks/__tests__/use-question-form.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useQuestionForm } from '../use-question-form';

describe('useQuestionForm', () => {
  it('validates required fields', () => {
    const { result } = renderHook(() => useQuestionForm({ mode: 'create' }));

    const validation = result.current.validate();

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Category is required');
    expect(validation.errors).toContain('Question prompt is required');
  });

  it('builds correct MCQ payload', () => {
    const { result } = renderHook(() => useQuestionForm({ mode: 'create' }));

    act(() => {
      result.current.setFormData(prev => ({
        ...prev,
        category_id: 'cat-1',
        prompt: 'Test question?',
      }));
    });

    const payload = result.current.buildCreatePayload();

    expect(payload.type).toBe('mcq_single');
    expect(payload.category_id).toBe('cat-1');
    expect(payload.prompt.en).toBe('Test question?');
  });

  // Add more tests...
});
```

#### Verification
- [ ] Form still works for creating new questions
- [ ] Form still works for editing existing questions
- [ ] Validation errors display correctly
- [ ] MCQ questions save correctly
- [ ] Text Input questions save correctly
- [ ] Run unit tests: `npm test use-question-form`
- [ ] Run: `npm run lint` - no errors

---

### 2.2 Extract Progressive Loading Hook

**Effort**: 1.5 hours
**Impact**: Simplifies QuestionList, improves testability
**Risk**: Medium (complex state management)

#### Current State
- QuestionList component is 632 lines
- Progressive loading logic (questionsByPage Map, prefetch) is interleaved with UI
- Located in: `/Users/user/dev/quizball/cms/src/components/questions/question-list.tsx`

#### Implementation Steps

1. **Create new hook**: `/Users/user/dev/quizball/cms/src/hooks/use-progressive-questions.ts`

```typescript
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services';
import type { Question, ListQuestionsParams } from '@/types';

interface UseProgressiveQuestionsOptions {
  params: ListQuestionsParams;
  currentPage: number;
  enabled?: boolean;
}

export function useProgressiveQuestions({
  params,
  currentPage,
  enabled = true
}: UseProgressiveQuestionsOptions) {
  const queryClient = useQueryClient();
  const [questionsByPage, setQuestionsByPage] = useState<Map<number, Question[]>>(new Map());
  const [prefetchedPages, setPrefetchedPages] = useState<Set<number>>(new Set());

  // Fetch current page
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['questions', 'list', params, currentPage],
    queryFn: () => questionsService.listQuestions({ ...params, page: currentPage }),
    enabled,
  });

  // Update questionsByPage when data arrives
  useEffect(() => {
    if (data?.questions) {
      setQuestionsByPage(prev => {
        const next = new Map(prev);
        next.set(currentPage, data.questions);
        return next;
      });
    }
  }, [data, currentPage]);

  // Flatten all loaded questions in order
  const loadedQuestions = useMemo(() => {
    const allQuestions: Question[] = [];
    const sortedPages = Array.from(questionsByPage.keys()).sort((a, b) => a - b);

    for (const pageNum of sortedPages) {
      const pageQuestions = questionsByPage.get(pageNum);
      if (pageQuestions) {
        allQuestions.push(...pageQuestions);
      }
    }

    return allQuestions;
  }, [questionsByPage]);

  // Prefetch adjacent pages using React Query's cache
  const prefetchAdjacentPage = useCallback(async (pageToFetch: number) => {
    if (prefetchedPages.has(pageToFetch) || questionsByPage.has(pageToFetch)) {
      return;
    }

    try {
      setPrefetchedPages(prev => new Set(prev).add(pageToFetch));

      // Use queryClient.prefetchQuery to leverage React Query's caching
      await queryClient.prefetchQuery({
        queryKey: ['questions', 'list', params, pageToFetch],
        queryFn: () => questionsService.listQuestions({ ...params, page: pageToFetch }),
      });

      // Optionally get the data from cache and update local state
      const cachedData = queryClient.getQueryData<{ questions: Question[] }>([
        'questions',
        'list',
        params,
        pageToFetch,
      ]);

      if (cachedData?.questions) {
        setQuestionsByPage(prev => {
          const next = new Map(prev);
          next.set(pageToFetch, cachedData.questions);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to prefetch page:', error);
      setPrefetchedPages(prev => {
        const next = new Set(prev);
        next.delete(pageToFetch);
        return next;
      });
    }
  }, [params, prefetchedPages, questionsByPage, queryClient]);

  // Clear cache when params change
  const clearCache = useCallback(() => {
    setQuestionsByPage(new Map());
    setPrefetchedPages(new Set());
  }, []);

  return {
    loadedQuestions,
    totalQuestions: data?.pagination.total || 0,
    isLoading,
    error,
    refetch,
    prefetchAdjacentPage,
    clearCache,
  };
}
```

2. **Update question-list.tsx**:
   - Add import: `import { useProgressiveQuestions } from '@/hooks/use-progressive-questions';`
   - Replace existing query and state management:
     ```typescript
     const {
       loadedQuestions,
       totalQuestions,
       isLoading,
       error,
       refetch,
       prefetchAdjacentPage,
       clearCache,
     } = useProgressiveQuestions({
       params: queryParams,
       currentPage: pagination.page,
       enabled: true,
     });
     ```
   - Remove questionsByPage state (line ~77)
   - Remove manual prefetch logic (lines ~150-171)
   - Update effects to use clearCache when filters change
   - Update pagination to use totalQuestions from hook

3. **Update preview navigation** to trigger prefetch:
```typescript
const handlePreviewNavigate = (newIndex: number) => {
  setActiveQuestionIndex(newIndex);

  // Calculate which page this question is on
  const questionPage = Math.floor(newIndex / pagination.pageSize) + 1;

  // Prefetch adjacent pages
  if (questionPage > pagination.page) {
    prefetchAdjacentPage(questionPage + 1);
  } else if (questionPage < pagination.page) {
    prefetchAdjacentPage(questionPage - 1);
  }
};
```

#### Verification
- [ ] Questions list loads correctly
- [ ] Pagination works
- [ ] Preview navigation works
- [ ] Adjacent pages prefetch (check Network tab)
- [ ] Filter changes reset the cache
- [ ] Run: `npm run lint` - no errors

---

### 2.3 Batch Bulk Operations

**Effort**: 45 minutes
**Impact**: Prevents API overload, provides better feedback
**Risk**: Low

#### Current State
- `handleBulkDelete` and `handleBulkStatusChange` use unbounded `Promise.all`
- Can fire 100+ simultaneous requests
- Located in: `/Users/user/dev/quizball/cms/src/components/questions/question-list.tsx` (lines 187-217)

#### Implementation Steps

1. **Create batching utility**: `/Users/user/dev/quizball/cms/src/lib/batch-utils.ts`

```typescript
export interface BatchResult<T> {
  successful: T[];
  failed: Array<{ item: T; error: unknown }>;
}

export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchResult<T>> {
  const successful: T[] = [];
  const failed: Array<{ item: T; error: unknown }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(item => processor(item))
    );

    results.forEach((result, index) => {
      const item = batch[index];
      if (result.status === 'fulfilled') {
        successful.push(item);
      } else {
        failed.push({ item, error: result.reason });
      }
    });

    onProgress?.(successful.length + failed.length, items.length);
  }

  return { successful, failed };
}
```

2. **Update handleBulkDelete** in question-list.tsx (lines ~187-197):

```typescript
const handleBulkDelete = async () => {
  if (selectedIds.length === 0) {
    toast.error('No questions selected');
    return;
  }

  const confirmed = window.confirm(
    `Are you sure you want to delete ${selectedIds.length} question${selectedIds.length > 1 ? 's' : ''}?`
  );

  if (!confirmed) return;

  try {
    const result = await processBatch(
      selectedIds,
      (id) => deleteQuestion.mutateAsync(id),
      10, // Batch size of 10
      (completed, total) => setBulkProgress(`Deleting ${completed}/${total}...`)
    );

    if (result.successful.length > 0) {
      toast.success(
        `Deleted ${result.successful.length} question${result.successful.length > 1 ? 's' : ''}`
      );
      setSelectedIds([]);
      refetch();
    }

    if (result.failed.length > 0) {
      toast.error(
        `Failed to delete ${result.failed.length} question${result.failed.length > 1 ? 's' : ''}`
      );
    }
  } catch (error) {
    toast.error('Bulk delete operation failed');
  } finally {
    setBulkProgress(null);
  }
};
```

3. **Update handleBulkStatusChange** (lines ~208-217):

```typescript
const handleBulkStatusChange = async (newStatus: QuestionStatus) => {
  if (selectedIds.length === 0) {
    toast.error('No questions selected');
    return;
  }

  try {
    const result = await processBatch(
      selectedIds,
      (id) => updateStatus.mutateAsync({ id, status: newStatus }),
      10, // Batch size of 10
      (completed, total) => setBulkProgress(`Updating ${completed}/${total}...`)
    );

    if (result.successful.length > 0) {
      toast.success(
        `Updated ${result.successful.length} question${result.successful.length > 1 ? 's' : ''} to ${newStatus}`
      );
      setSelectedIds([]);
      refetch();
    }

    if (result.failed.length > 0) {
      toast.error(
        `Failed to update ${result.failed.length} question${result.failed.length > 1 ? 's' : ''}`
      );
    }
  } catch (error) {
    toast.error('Bulk status change operation failed');
  } finally {
    setBulkProgress(null);
  }
};
```

4. **Add loading state** during bulk operations:

```typescript
const [isBulkOperating, setIsBulkOperating] = useState(false);
const [bulkProgress, setBulkProgress] = useState<string | null>(null);

// Wrap both handlers
const handleBulkDelete = async () => {
  // ... existing code ...
  setIsBulkOperating(true);
  try {
    // ... existing logic ...
  } finally {
    setIsBulkOperating(false);
  }
};

// Disable buttons during operation
<Button
  disabled={selectedIds.length === 0 || isBulkOperating}
  onClick={handleBulkDelete}
>
  {isBulkOperating ? 'Deleting...' : 'Delete Selected'}
</Button>
```

#### Verification
- [ ] Select 20+ questions and bulk delete - should batch in groups of 10
- [ ] Verify success/failure counts are accurate
- [ ] Check Network tab - max 10 concurrent requests
- [ ] Test bulk status change with multiple questions
- [ ] Verify UI shows loading state during operation
- [ ] Run: `npm run lint` - no errors

---

## Phase 3: Code Cleanup (30 minutes)

### 3.1 Remove Unused Imports

**Effort**: 10 minutes
**Impact**: Reduces cognitive load, cleaner code
**Risk**: Very Low

#### Files to Clean

1. **question-list.tsx** (lines 41-46):
   - Remove unused lucide-react imports: `SignalHigh`, `SignalMedium`, `SignalLow`, `Circle`
   - Keep only imports that are actually used in the component

2. **Run ESLint to find other unused imports**:
```bash
cd /Users/user/dev/quizball/cms
npx eslint src/components/**/*.tsx --quiet --rule 'no-unused-vars: error'
```

#### Implementation Steps

1. Review each file flagged by ESLint
2. Remove unused imports
3. Verify file still compiles

#### Verification
- [ ] Run: `npm run lint` - no unused import warnings
- [ ] Run: `npx tsc --noEmit` - no errors
- [ ] Application still runs correctly

---

### 3.2 Remove Commented Code

**Effort**: 5 minutes
**Impact**: Cleaner codebase
**Risk**: Very Low

#### Files to Clean

1. **bulk-upload-dialog.tsx** (lines 388-396):
   - Remove commented-out "Important Rules" section
   - If the rules are needed, implement them properly
   - If not needed, delete completely

```typescript
// DELETE THESE LINES (388-396):
{/* <Alert className="border-amber-500 bg-amber-50">
  <AlertCircle className="h-4 w-4 text-amber-600" />
  <AlertTitle className="text-amber-900 text-sm font-semibold">Important Rules</AlertTitle>
  <AlertDescription className="text-amber-800 text-xs mt-2">
    <ul className="list-disc list-inside space-y-1">
      ...
    </ul>
  </AlertDescription>
</Alert> */}
```

2. **Search for other commented code**:
```bash
cd /Users/user/dev/quizball/cms
grep -r "^[[:space:]]*//" src/ --include="*.tsx" | head -20
```

#### Verification
- [ ] File still compiles
- [ ] UI looks correct without commented code
- [ ] No functionality lost

---

### 3.3 Fix Minimax Array Mutation (Bonus)

**Effort**: 10 minutes
**Impact**: Prevents potential state corruption
**Risk**: Very Low

#### Current State
- `findBestMove` and `minimax` functions mutate the board array
- Located in: `/Users/user/dev/quizball/cms/src/lib/game-ai/minimax.ts`

#### Implementation Steps

1. **Update findBestMove** (lines 21-37):

```typescript
export function findBestMove(board: Board, aiPlayer: Player, humanPlayer: Player): number {
  let bestScore = -Infinity;
  let bestMove = -1;

  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      // Create a copy instead of mutating
      const newBoard = [...board];
      newBoard[i] = aiPlayer;
      const score = minimax(newBoard, 0, false, aiPlayer, humanPlayer);

      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }

  return bestMove;
}
```

2. **Update minimax function** (lines 68-88):

```typescript
function minimax(
  board: Board,
  depth: number,
  isMaximizing: boolean,
  aiPlayer: Player,
  humanPlayer: Player
): number {
  const winner = checkWinner(board);

  if (winner === aiPlayer) return 10 - depth;
  if (winner === humanPlayer) return depth - 10;
  if (isBoardFull(board)) return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        const newBoard = [...board];
        newBoard[i] = aiPlayer;
        const score = minimax(newBoard, depth + 1, false, aiPlayer, humanPlayer);
        bestScore = Math.max(score, bestScore);
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        const newBoard = [...board];
        newBoard[i] = humanPlayer;
        const score = minimax(newBoard, depth + 1, true, aiPlayer, humanPlayer);
        bestScore = Math.min(score, bestScore);
      }
    }
    return bestScore;
  }
}
```

#### Verification
- [ ] Play tic-tac-toe game - AI still works correctly
- [ ] AI makes smart moves (should be unbeatable on hard difficulty)
- [ ] No console errors
- [ ] Run: `npm run lint` - no errors

---

## Testing Checklist

After implementing all changes, run through this comprehensive test:

### Unit Tests
- [ ] Run: `npm test`
- [ ] All tests pass
- [ ] Coverage remains stable or improves

### Type Safety
- [ ] Run: `npx tsc --noEmit`
- [ ] No TypeScript errors

### Linting
- [ ] Run: `npm run lint`
- [ ] 0 errors, minimal warnings

### Manual Testing

#### Questions Management
- [ ] List questions - pagination works
- [ ] Create new MCQ question - saves correctly
- [ ] Create new Text Input question - saves correctly
- [ ] Edit existing question - updates correctly
- [ ] Delete single question - works
- [ ] Bulk delete multiple questions - batches correctly
- [ ] Bulk status change - batches correctly
- [ ] Filter by category - works
- [ ] Search questions - works
- [ ] Preview navigation - prefetches adjacent pages

#### UI Components
- [ ] Difficulty indicators display correctly everywhere
- [ ] Form validation shows appropriate errors
- [ ] Loading states display during operations
- [ ] Toast notifications are helpful and accurate

#### Error Handling
- [ ] Slow API requests timeout after 30 seconds
- [ ] Failed bulk operations show partial success/failure
- [ ] Network errors display user-friendly messages

#### Performance
- [ ] Large question lists load smoothly
- [ ] Progressive loading prefetches efficiently
- [ ] Bulk operations don't freeze UI
- [ ] No memory leaks in question list

---

## Rollback Plan

If any phase causes issues:

1. **Git status check**:
```bash
git status
git diff
```

2. **Revert specific file**:
```bash
git checkout HEAD -- path/to/file.tsx
```

3. **Revert entire phase**:
```bash
git reset --hard HEAD
```

4. **Create checkpoint commits** after each phase:
```bash
git add .
git commit -m "Phase 1: High-impact quick wins complete"
```

---

## Success Metrics

After completion, the codebase should demonstrate:

- ✅ **Reduced duplication**: DifficultySignal extracted, questionToFormData reused
- ✅ **Improved testability**: useQuestionForm can be unit tested
- ✅ **Better separation of concerns**: Form logic separated from UI, loading logic isolated
- ✅ **Enhanced reliability**: API timeouts prevent hanging, batching prevents overload
- ✅ **Cleaner code**: No unused imports, no commented code, no mutations
- ✅ **Better UX**: Partial success feedback in bulk ops, timeout error messages

---

## Timeline

| Phase | Duration | Can Start |
|-------|----------|-----------|
| Phase 1.1: DifficultySignal | 15 min | Immediately |
| Phase 1.2: questionToFormData | 30 min | After 1.1 |
| Phase 1.3: API Timeouts | 45 min | After 1.2 |
| Phase 2.1: useQuestionForm | 2.5 hours | After Phase 1 |
| Phase 2.2: Progressive Loading | 1.5 hours | After 2.1 |
| Phase 2.3: Batch Operations | 45 min | After 2.2 |
| Phase 3: Code Cleanup | 30 min | After Phase 2 |

**Total: ~6.5 hours** (plus 1-2 hours buffer for testing = 7.5-8.5 hours realistic)

---

## Notes

- Each phase is independent and can be done separately
- Create git commits after each phase for easy rollback
- Test thoroughly after each change before moving to the next
- If time is limited, prioritize Phase 1 (highest impact, lowest effort)
- Phase 2 and 3 can be deferred if needed

---

**Created**: 2026-01-26
**Status**: Ready for implementation
**Review Required**: After Phase 2.1 (major refactor)
