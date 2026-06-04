'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQuestions, useDeleteQuestion, useUpdateQuestionStatus, useCategories } from '@/hooks';
import { questionsService } from '@/services/questions.service';
import {
  QUESTION_TYPE_LABELS,
} from '@/lib/constants';
import { cn, getLocalizedTextByLang } from '@/lib/utils';
import type { ListQuestionsParams, QuestionStatus, Question } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { motion } from 'framer-motion';
import {
  Search,
  MoreHorizontal,
  Trash2,
  Archive,
  Send,
  Clock,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  FileText,
  LayoutList,
  AlertCircle,
  Layers,
  Languages,
  Image as ImageIcon,
  X
} from 'lucide-react';
import { QuestionDialog } from './question-dialog';
import { DifficultySignal, getDifficultyTextColor } from '@/components/ui/difficulty-signal';
import { processBatch } from '@/lib/batch-utils';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import { useErrorFeedbackDialog } from '@/hooks/use-error-feedback-dialog';
import { ErrorFeedbackDialog } from '@/components/error-feedback-dialog';
import {
  getDailyChallengeQuestionTypeForCategory,
} from '@/lib/daily-challenge-question-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type DisplayLocale = 'en' | 'ka';
type TypeFilterValue = NonNullable<ListQuestionsParams['type']> | 'mcq_single_image' | 'all';

const DISPLAY_LOCALES: Array<{ value: DisplayLocale; label: string; name: string }> = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'ka', label: 'KA', name: 'Georgian' },
];

const GEORGIAN_TEXT_PATTERN = /[\u10A0-\u10FF]/;

export function QuestionList() {
  const [params, setParams] = useState<ListQuestionsParams>({
    page: 1,
    limit: 10,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLocale, setDisplayLocale] = useState<DisplayLocale>('en');
  const [deleteState, setDeleteState] = useState<{ type: 'single'; id: string } | { type: 'bulk' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [isBulkOperating, setIsBulkOperating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number; successful: number; failed: number } | null>(null);
  const { errorFeedback, showErrorFeedback, closeErrorFeedback } = useErrorFeedbackDialog();
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  // Progressive loading for preview navigation
  const [questionsByPage, setQuestionsByPage] = useState<Map<number, Question[]>>(new Map());
  const [inFlightPages, setInFlightPages] = useState<Set<number>>(new Set());
  const inFlightControllersRef = useRef(new Map<number, AbortController>());

  // Flatten questions from all loaded pages in order
  const loadedQuestions = useMemo(() => {
    const pages = Array.from(questionsByPage.keys()).sort((a, b) => a - b);
    return pages.flatMap(page => questionsByPage.get(page) || []);
  }, [questionsByPage]);

  const { data, isLoading, error } = useQuestions(params);
  const { data: categories } = useCategories();
  const deleteQuestion = useDeleteQuestion();
  const updateStatus = useUpdateQuestionStatus();

  // Sync current page questions with questionsByPage
  useEffect(() => {
    if (data?.data) {
      const currentPage = params.page || 1;
      setQuestionsByPage((prev) => {
        const newMap = new Map(prev);
        newMap.set(currentPage, data.data);
        return newMap;
      });
    }
  }, [data, params.page]);

  // Reset loaded questions when filters change
  useEffect(() => {
    setQuestionsByPage(new Map());
  }, [params.category_id, params.status, params.difficulty, params.type, params.mcq_image, params.search]);

  useEffect(() => {
    const controllers = inFlightControllersRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  // Function to fetch additional pages for preview navigation
  const fetchAdjacentPage = async (pageToFetch: number) => {
    if (questionsByPage.has(pageToFetch) || inFlightPages.has(pageToFetch) || !data) return;
    if (pageToFetch < 1 || pageToFetch > data.total_pages) return;

    const controller = new AbortController();
    inFlightControllersRef.current.set(pageToFetch, controller);
    setInFlightPages((prev) => new Set(prev).add(pageToFetch));

    try {
      const pageData = await questionsService.list({
        ...params,
        page: pageToFetch,
      }, controller.signal);

      setQuestionsByPage((prev) => {
        const newMap = new Map(prev);
        newMap.set(pageToFetch, pageData.data);
        return newMap;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.debug('questions', 'Adjacent page fetch aborted', { pageToFetch });
      } else {
        logger.error('questions', 'Failed to fetch adjacent page', { error, pageToFetch });
        toast.error('Failed to load more questions');
      }
    } finally {
      inFlightControllersRef.current.delete(pageToFetch);
      setInFlightPages((prev) => {
        const next = new Set(prev);
        next.delete(pageToFetch);
        return next;
      });
    }
  };

  // Handle preview navigation with progressive loading
  const handlePreviewNavigate = (newIndex: number) => {
    if (!data) return;

    // Check if we need to load more questions
    const threshold = 3; // Fetch when within 3 questions of edge
    const questionsPerPage = params.limit || 10;

    // Calculate which page contains this index
    const targetPage = Math.floor(newIndex / questionsPerPage) + 1;

    // Prefetch next page if close to end of loaded questions
    if (newIndex >= loadedQuestions.length - threshold && targetPage < data.total_pages) {
      fetchAdjacentPage(targetPage + 1);
    }

    // Prefetch previous page if close to start and there are earlier pages
    if (newIndex <= threshold && targetPage > 1) {
      fetchAdjacentPage(targetPage - 1);
    }
  };

  const handleFilterChange = (key: keyof ListQuestionsParams, value: string | undefined) => {
    setParams((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
      page: 1, // Reset to first page on filter change
    }));
  };

  const handleTypeFilterChange = (value: TypeFilterValue) => {
    setParams((prev) => {
      if (value === 'all') {
        return {
          ...prev,
          type: undefined,
          mcq_image: undefined,
          page: 1,
        };
      }

      if (value === 'mcq_single_image') {
        return {
          ...prev,
          type: 'mcq_single',
          mcq_image: 'with',
          page: 1,
        };
      }

      return {
        ...prev,
        type: value,
        mcq_image: undefined,
        page: 1,
      };
    });
  };

  const handleCategoryFilterChange = (value: string) => {
    if (value === 'all') {
      handleFilterChange('category_id', value);
      return;
    }

    const category = categories?.find((cat) => cat.id === value);
    const dailyChallengeType = getDailyChallengeQuestionTypeForCategory(category);

    if (dailyChallengeType) {
      setParams((prev) => ({
        ...prev,
        category_id: value,
        type: dailyChallengeType,
        mcq_image: undefined,
        page: 1,
      }));
      return;
    }

    handleFilterChange('category_id', value);
  };

  const handleSearch = () => {
    const nextSearch = searchQuery.trim();
    setParams((prev) => ({
      ...prev,
      search: nextSearch || undefined,
      page: 1,
    }));
  };

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    if (GEORGIAN_TEXT_PATTERN.test(value)) {
      setDisplayLocale('ka');
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextSearch = searchQuery.trim() || undefined;
      setParams((prev) => (
        prev.search === nextSearch
          ? prev
          : { ...prev, search: nextSearch, page: 1 }
      ));
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleDelete = async () => {
    if (!deleteState || deleteState.type !== 'single') return;
    try {
      const result = await deleteQuestion.mutateAsync(deleteState.id);
      toast.success(result.message);
      setDeleteState(null);
    } catch (error) {
      showErrorFeedback(error, {
        fallbackTitle: 'Failed to delete question',
        logModule: 'questions',
        logMessage: 'Failed to delete question from list',
        logData: {
          questionId: deleteState.id,
        },
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      toast.error('No questions selected');
      return;
    }

    setIsBulkOperating(true);
    setBulkProgress({ completed: 0, total: selectedIds.length, successful: 0, failed: 0 });
    try {
      const result = await processBatch(
        selectedIds,
        async (id) => {
          const deleteResult = await deleteQuestion.mutateAsync(id);
          return deleteResult;
        },
        {
          batchSize: 5,
          delayBetweenBatches: 500,
          onProgress: setBulkProgress,
        }
      );

      if (result.successful.length > 0) {
        toast.success(
          `Deleted ${result.successful.length} question${result.successful.length > 1 ? 's' : ''}`
        );
        setSelectedIds([]);
        setDeleteState(null);
      }

      if (result.failed.length > 0) {
        logger.error('questions', 'Bulk delete had failed items', {
          failedCount: result.failed.length,
          failed: result.failed.map(({ item, error }) => ({
            questionId: item,
            ...getErrorLogDetails(error),
          })),
        });
        toast.error(
          `Failed to delete ${result.failed.length} question${result.failed.length > 1 ? 's' : ''}`
        );
        showErrorFeedback(result.failed[0].error, {
          fallbackTitle: `Failed to delete ${result.failed.length} question${result.failed.length > 1 ? 's' : ''}`,
          logModule: 'questions',
          logMessage: 'Bulk delete failed',
          logData: {
            failedCount: result.failed.length,
            firstFailedQuestionId: result.failed[0].item,
          },
        });
      }
    } catch (error) {
      showErrorFeedback(error, {
        fallbackTitle: 'Bulk delete operation failed',
        logModule: 'questions',
        logMessage: 'Bulk delete operation failed',
        logData: {
          selectedCount: selectedIds.length,
        },
      });
    } finally {
      setIsBulkOperating(false);
      setBulkProgress(null);
    }
  };

  const handleStatusChange = async (id: string, status: QuestionStatus) => {
    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      toast.success('Status updated');
    } catch (error) {
      showErrorFeedback(error, {
        fallbackTitle: 'Failed to update status',
        logModule: 'questions',
        logMessage: 'Failed to update question status from list',
        logData: {
          questionId: id,
          nextStatus: status,
        },
      });
    }
  };

  const handleBulkStatusChange = async (status: QuestionStatus) => {
    if (selectedIds.length === 0) {
      toast.error('No questions selected');
      return;
    }

    setIsBulkOperating(true);
    setBulkProgress({ completed: 0, total: selectedIds.length, successful: 0, failed: 0 });
    try {
      const result = await processBatch(
        selectedIds,
        (id) => updateStatus.mutateAsync({ id, data: { status } }),
        {
          batchSize: 5, // Smaller batch size to avoid rate limiting
          delayBetweenBatches: 500, // 500ms delay between batches
          onProgress: setBulkProgress,
        }
      );

      if (result.successful.length > 0) {
        toast.success(
          `Updated ${result.successful.length} question${result.successful.length > 1 ? 's' : ''} to ${status}`
        );
        setSelectedIds([]);
      }

      if (result.failed.length > 0) {
        logger.error('questions', 'Bulk status update had failed items', {
          nextStatus: status,
          failedCount: result.failed.length,
          failed: result.failed.map(({ item, error }) => ({
            questionId: item,
            ...getErrorLogDetails(error),
          })),
        });
        toast.error(
          `Failed to update ${result.failed.length} question${result.failed.length > 1 ? 's' : ''}`
        );
        showErrorFeedback(result.failed[0].error, {
          fallbackTitle: `Failed to update ${result.failed.length} question${result.failed.length > 1 ? 's' : ''}`,
          logModule: 'questions',
          logMessage: 'Bulk status update failed',
          logData: {
            nextStatus: status,
            failedCount: result.failed.length,
            firstFailedQuestionId: result.failed[0].item,
          },
        });
      }
    } catch (error) {
      showErrorFeedback(error, {
        fallbackTitle: 'Bulk status change operation failed',
        logModule: 'questions',
        logMessage: 'Bulk status change operation failed',
        logData: {
          nextStatus: status,
          selectedCount: selectedIds.length,
        },
      });
    } finally {
      setIsBulkOperating(false);
      setBulkProgress(null);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories?.find((c) => c.id === categoryId);
    return category ? getLocalizedTextByLang(category.name, displayLocale, category.slug) : 'Unknown';
  };

  const getQuestionTypeLabel = (type: NonNullable<ListQuestionsParams['type']>) =>
    QUESTION_TYPE_LABELS[type];

  const hasMcqImage = (question: Question) =>
    question.payload?.type === 'mcq_single' && Boolean(question.payload.image?.url);

  const getQuestionTypeDisplayLabel = (question: Question) =>
    hasMcqImage(question) ? 'Multiple Choice + Image' : QUESTION_TYPE_LABELS[question.type];

  const getQuestionTitle = (question: Question) => {
    const getText = (field: Question['prompt'] | null | undefined, fallback = '') =>
      getLocalizedTextByLang(field, displayLocale, fallback).trim();
    const promptTitle = getText(question.prompt);
    const payload = question.payload;

    if (payload?.type === 'countdown_list') {
      return getText(payload.prompt, promptTitle || 'Untitled Question');
    }

    if (payload?.type === 'put_in_order') {
      return getText(payload.prompt, promptTitle || 'Untitled Question');
    }

    if (payload?.type === 'football_logic' && payload.prompt) {
      return getText(payload.prompt, promptTitle || 'Untitled Question');
    }

    if (promptTitle) {
      return promptTitle;
    }

    if (payload?.type === 'clue_chain') {
      return getText(payload.clues[0]?.content, getText(payload.display_answer, 'Untitled Question'));
    }

    if (payload?.type === 'career_path') {
      const clubs = payload.clubs
        .map((club) => getText(club))
        .filter(Boolean);
      return clubs.length > 0 ? clubs.join(' -> ') : getText(payload.display_answer, 'Untitled Question');
    }

    if (payload?.type === 'high_low') {
      return getText(payload.stat_label, 'Untitled Question');
    }

    return 'Untitled Question';
  };


  const visibleIds = useMemo(() => data?.data.map((question) => question.id) ?? [], [data]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const handleSelectAllAcrossPages = async () => {
    if (!data || data.total <= visibleIds.length) return;

    setIsSelectingAll(true);
    try {
      const allIds = await questionsService.getAllIds({
        category_id: params.category_id,
        status: params.status,
        difficulty: params.difficulty,
        type: params.type,
        mcq_image: params.mcq_image,
        search: params.search,
      });
      setSelectedIds(allIds);
      toast.success(`Selected all ${allIds.length} questions`);
    } catch (error) {
      showErrorFeedback(error, {
        fallbackTitle: 'Failed to select all questions',
        logModule: 'questions',
        logMessage: 'Failed to select all questions',
        logData: {
          params,
        },
      });
    } finally {
      setIsSelectingAll(false);
    }
  };

  if (error) {
    return (
      <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load questions. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <ErrorFeedbackDialog feedback={errorFeedback} onOpenChange={(isOpen) => {
        if (!isOpen) closeErrorFeedback();
      }} />
      {/* Search & Filter Bar - Lightweight Toolbar style */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[300px] relative group">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400 transition-colors group-focus-within:text-gray-900" />
            <Input
              placeholder={displayLocale === 'ka' ? 'Search Georgian or English text...' : 'Search questions...'}
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10 h-10 bg-gray-200/30 border-transparent rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-gray-900/5 focus:bg-white focus:border-gray-200 transition-all font-medium"
            />
          </div>

          <div className="flex h-10 items-center rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <Languages className="ml-2 mr-1.5 h-4 w-4 text-slate-400" />
            {DISPLAY_LOCALES.map((locale) => (
              <button
                key={locale.value}
                type="button"
                aria-pressed={displayLocale === locale.value}
                title={`Show ${locale.name} text`}
                onClick={() => setDisplayLocale(locale.value)}
                className={cn(
                  'h-8 rounded-lg px-3 text-xs font-black uppercase tracking-widest transition-all',
                  displayLocale === locale.value
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                )}
              >
                {locale.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={params.category_id || 'all'}
              onValueChange={handleCategoryFilterChange}
            >
              <SelectTrigger className="w-[160px] h-10 bg-white border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                <SelectItem value="all" className="text-xs font-medium">Categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id} className="text-xs font-medium">
                    {getLocalizedTextByLang(cat.name, displayLocale, cat.slug)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={params.status || 'all'}
              onValueChange={(v) => handleFilterChange('status', v)}
            >
              <SelectTrigger className="w-[120px] h-10 bg-white border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                <SelectItem value="all" className="text-xs font-medium">Status</SelectItem>
                <SelectItem value="draft" className="text-xs font-medium">Draft</SelectItem>
                <SelectItem value="published" className="text-xs font-medium">Published</SelectItem>
                <SelectItem value="archived" className="text-xs font-medium">Archived</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={params.difficulty || 'all'}
              onValueChange={(v) => handleFilterChange('difficulty', v)}
            >
              <SelectTrigger className="w-[120px] h-10 bg-white border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                <SelectItem value="all" className="text-xs font-medium">Difficulty</SelectItem>
                <SelectItem value="easy" className="text-xs font-medium text-emerald-600">Easy</SelectItem>
                <SelectItem value="medium" className="text-xs font-medium text-amber-600">Medium</SelectItem>
                <SelectItem value="hard" className="text-xs font-medium text-rose-600">Hard</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={params.mcq_image === 'with' ? 'mcq_single_image' : (params.type || 'all')}
              onValueChange={(v) => handleTypeFilterChange(v as TypeFilterValue)}
            >
              <SelectTrigger className="w-[190px] h-10 bg-white border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                <SelectItem value="all" className="text-xs font-medium">Type</SelectItem>
                <SelectItem value="mcq_single_image" className="text-xs font-medium">
                  Multiple Choice + Image
                </SelectItem>
                {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs font-medium">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 bg-white border border-gray-200/70 rounded-xl px-3 py-2 shadow-sm">
              {isBulkOperating && bulkProgress ? (
                <>
                  <div className="flex items-center gap-2 min-w-[200px]">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-600 whitespace-nowrap">
                      {bulkProgress.completed}/{bulkProgress.total}
                    </span>
                  </div>
                  {bulkProgress.failed > 0 && (
                    <span className="text-xs font-bold text-red-500">
                      {bulkProgress.failed} failed
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-gray-600">
                    {selectedIds.length} selected
                  </span>
                  <div className="h-4 w-px bg-gray-200" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-bold"
                    onClick={() => handleBulkStatusChange('published')}
                    disabled={params.status === 'published' || isBulkOperating}
                  >
                    Publish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-bold"
                    onClick={() => handleBulkStatusChange('draft')}
                    disabled={params.status === 'draft' || isBulkOperating}
                  >
                    Move to Draft
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-bold"
                    onClick={() => setDeleteState({ type: 'bulk' })}
                    disabled={isBulkOperating}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {params.category_id && (
            <button
              onClick={() => handleFilterChange('category_id', 'all')}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-full text-[11px] font-bold transition-all hover:bg-slate-800"
            >
              Category: {getCategoryName(params.category_id)}
              <X className="w-3 h-3" />
            </button>
          )}
          {params.status && (params.status as string) !== 'all' && (
            <button
              onClick={() => handleFilterChange('status', 'all')}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-full text-[11px] font-bold transition-all hover:bg-slate-800"
            >
              Status: {params.status}
              <X className="w-3 h-3" />
            </button>
          )}
          {params.difficulty && (params.difficulty as string) !== 'all' && (
            <button
              onClick={() => handleFilterChange('difficulty', 'all')}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-full text-[11px] font-bold transition-all hover:bg-slate-800"
            >
              Difficulty: {params.difficulty}
              <X className="w-3 h-3" />
            </button>
          )}
          {params.type && (params.type as string) !== 'all' && (
            <button
              onClick={() => handleTypeFilterChange('all')}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-full text-[11px] font-bold transition-all hover:bg-slate-800"
            >
              Type: {params.mcq_image === 'with' ? 'Multiple Choice + Image' : getQuestionTypeLabel(params.type)}
              <X className="w-3 h-3" />
            </button>
          )}
          {params.search && (
            <button
              onClick={() => {
                setSearchQuery('');
                handleFilterChange('search', undefined);
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-full text-[11px] font-bold transition-all hover:bg-slate-800"
            >
              Search: {params.search}
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Modernized List - Soft Rows */}
      <div className="space-y-px">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-white border border-gray-100 rounded-2xl animate-pulse mb-2" />
          ))
        ) : data?.data.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4 text-gray-400 bg-white rounded-[2rem] border border-dashed border-gray-200">
            <HelpCircle className="h-12 w-12 opacity-10" />
            <div className="text-center">
              <p className="text-sm font-bold text-gray-900">No questions found</p>
              <p className="text-xs font-medium mt-1">Try adjusting your filters or search terms.</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border-0">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 bg-white">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-md border-gray-200 text-slate-900 focus:ring-slate-900 transition-all"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Select all
              </span>
            </div>
            {/* Select all across pages banner */}
            {allVisibleSelected && data && data.total > visibleIds.length && (
              <div className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100">
                <span className="text-xs font-medium text-blue-700">
                  All {visibleIds.length} questions on this page are selected.
                </span>
                <button
                  onClick={handleSelectAllAcrossPages}
                  disabled={isSelectingAll}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2 disabled:opacity-50"
                >
                  {isSelectingAll ? 'Selecting...' : `Select all ${data.total} questions`}
                </button>
              </div>
            )}
            {data?.data.map((question, index) => (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.2) }}
                className="group relative flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-all cursor-pointer border-b border-gray-50 last:border-0 hover:scale-[1.01] active:scale-[0.99]"
                onClick={() => setOpenQuestionId(question.id)}
              >
                <div className="flex-1 min-w-0 flex items-center gap-5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-md border-gray-200 text-slate-900 focus:ring-slate-900 transition-all"
                    checked={selectedIds.includes(question.id)}
                    onChange={() => toggleSelectOne(question.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  {/* Status Indicator Dot */}
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-500",
                    question.status === 'published' 
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
                      : "border-2 border-gray-200 bg-transparent"
                  )} />

                  <div className="flex flex-col min-w-0">
                    <span className="text-[16px] font-semibold text-slate-900 truncate leading-tight">
                      {getQuestionTitle(question)}
                    </span>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-xs font-medium text-slate-400">
                          {getCategoryName(question.category_id)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasMcqImage(question) ? (
                          <ImageIcon className="w-3.5 h-3.5 text-slate-300" />
                        ) : question.type === 'mcq_single' ? (
                          <LayoutList className="w-3.5 h-3.5 text-slate-300" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-slate-300" />
                        )}
                        <span className="text-xs font-medium text-slate-400">
                          {getQuestionTypeDisplayLabel(question)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DifficultySignal difficulty={question.difficulty} size="sm" />
                        <span className={cn("text-xs font-bold capitalize", getDifficultyTextColor(question.difficulty))}>
                          {question.difficulty}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 ml-4">
                  <div className="flex flex-col items-end gap-1 px-4">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Status</span>
                    <div className={cn(
                      "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest",
                      question.status === 'published' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                    )}>
                      {question.status}
                    </div>
                  </div>
                  {/* Actions - visible on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white hover:shadow-md text-slate-400 hover:text-slate-900 transition-all">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 bg-white/95 backdrop-blur-xl border-slate-100 shadow-2xl rounded-[1.25rem] p-2">
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'published')} disabled={question.status === 'published'} className="rounded-lg gap-3 py-2.5 px-3 font-medium transition-colors">
                          <Send className="h-4 w-4 text-emerald-500" /> Publish Question
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'draft')} disabled={question.status === 'draft'} className="rounded-lg gap-3 py-2.5 px-3 font-medium transition-colors">
                          <Clock className="h-4 w-4 text-slate-400" /> Move to Draft
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'archived')} disabled={question.status === 'archived'} className="rounded-lg gap-3 py-2.5 px-3 font-medium transition-colors">
                          <Archive className="h-4 w-4 text-slate-400" /> Archive Question
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-2 bg-slate-50" />
                        <DropdownMenuItem className="text-rose-500 focus:text-rose-600 focus:bg-rose-50 rounded-lg gap-3 py-2.5 px-3 font-bold transition-colors" onClick={() => setDeleteState({ type: 'single', id: question.id })}>
                          <Trash2 className="h-4 w-4" /> Delete Permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )
      }
      </div>

      {/* Question Preview/Edit Dialog */}
      {openQuestionId && (() => {
        const question = loadedQuestions.find(q => q.id === openQuestionId) || data?.data.find(q => q.id === openQuestionId);
        const questionIndex = loadedQuestions.findIndex(q => q.id === openQuestionId);
        const dataQuestionIndex = data?.data.findIndex(q => q.id === openQuestionId);
        const fallbackIndex = typeof dataQuestionIndex === 'number' && dataQuestionIndex >= 0 ? dataQuestionIndex : 0;

        if (!question) return null;

        return (
          <QuestionDialog
            mode="view"
            question={question}
            allQuestions={loadedQuestions.length > 0 ? loadedQuestions : (data?.data || [])}
            currentIndex={questionIndex !== -1 ? questionIndex : fallbackIndex}
            onNavigate={handlePreviewNavigate}
            totalAvailable={data?.total || 0}
            initialLocale={displayLocale}
            open={true}
            onOpenChange={(isOpen) => {
              if (!isOpen) setOpenQuestionId(null);
            }}
          />
        );
      })()}

      {/* Modernized Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">
            Showing <span className="text-foreground">{(data.page - 1) * data.limit + 1}</span> to{' '}
            <span className="text-foreground">{Math.min(data.page * data.limit, data.total)}</span> of{' '}
            <span className="text-foreground">{data.total}</span> questions
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setParams((p) => ({ ...p, page: (p.page || 1) - 1 }))}
              disabled={data.page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center px-3 py-1 bg-muted/50 rounded-lg border text-xs font-bold">
              {data.page} / {data.total_pages}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setParams((p) => ({ ...p, page: (p.page || 1) + 1 }))}
              disabled={data.page === data.total_pages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteState} onOpenChange={() => setDeleteState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription>
              {deleteState?.type === 'bulk'
                ? `Are you sure you want to delete ${selectedIds.length} selected question${selectedIds.length === 1 ? '' : 's'}? This action cannot be undone.`
                : 'Are you sure you want to delete this question? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteState(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteState?.type === 'bulk' ? handleBulkDelete : handleDelete}
              disabled={deleteQuestion.isPending || isBulkOperating}
            >
              {(deleteQuestion.isPending || isBulkOperating) ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
