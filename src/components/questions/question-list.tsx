'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useQuestions, useDeleteQuestion, useUpdateQuestionStatus, useCategories } from '@/hooks';
import {
  QUESTION_STATUS_LABELS,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
} from '@/lib/constants';
import { getLocalizedText } from '@/lib/utils';
import type { ListQuestionsParams, QuestionStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Search, 
  Plus, 
  MoreHorizontal, 
  Edit2, 
  Trash2, 
  Archive, 
  Send, 
  Clock, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  HelpCircle,
  FileText,
  LayoutList,
  AlertCircle,
  Layers,
  Zap,
  Copy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export function QuestionList() {
  const router = useRouter();
  const [params, setParams] = useState<ListQuestionsParams>({
    page: 1,
    limit: 10,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuestions(params);
  const { data: categories } = useCategories();
  const deleteQuestion = useDeleteQuestion();
  const updateStatus = useUpdateQuestionStatus();

  const handleFilterChange = (key: keyof ListQuestionsParams, value: string | undefined) => {
    setParams((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
      page: 1, // Reset to first page on filter change
    }));
  };

  const handleSearch = () => {
    setParams((prev) => ({
      ...prev,
      search: searchQuery || undefined,
      page: 1,
    }));
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteQuestion.mutateAsync(deleteId);
      toast.success('Question deleted successfully');
      setDeleteId(null);
    } catch {
      toast.error('Failed to delete question');
    }
  };

  const handleStatusChange = async (id: string, status: QuestionStatus) => {
    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories?.find((c) => c.id === categoryId);
    return category ? getLocalizedText(category.name, category.slug) : 'Unknown';
  };

  const statusVariant = (status: QuestionStatus) => {
    switch (status) {
      case 'published':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'draft':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      case 'archived':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const difficultyVariant = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-emerald-500';
      case 'medium':
        return 'text-amber-500';
      case 'hard':
        return 'text-rose-500';
      default:
        return 'text-muted-foreground';
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
      {/* Search & Filter Bar - Lightweight Toolbar style */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[300px] relative group">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400 transition-colors group-focus-within:text-gray-900" />
          <Input
            placeholder="Search questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10 h-10 bg-gray-200/30 border-transparent rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-gray-900/5 focus:bg-white focus:border-gray-200 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={params.category_id || 'all'}
            onValueChange={(v) => handleFilterChange('category_id', v)}
          >
            <SelectTrigger className="w-[160px] h-10 bg-white border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
              <SelectItem value="all" className="text-xs font-medium">All Categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id} className="text-xs font-medium">
                  {getLocalizedText(cat.name, cat.slug)}
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
              <SelectItem value="all" className="text-xs font-medium">All Status</SelectItem>
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
              <SelectItem value="all" className="text-xs font-medium">All Difficulty</SelectItem>
              <SelectItem value="easy" className="text-xs font-medium text-emerald-600">Easy</SelectItem>
              <SelectItem value="medium" className="text-xs font-medium text-amber-600">Medium</SelectItem>
              <SelectItem value="hard" className="text-xs font-medium text-rose-600">Hard</SelectItem>
            </SelectContent>
          </Select>
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
            <Button variant="outline" onClick={() => setParams({ page: 1, limit: 10 })} className="h-9 rounded-xl text-xs font-bold">
              Clear all filters
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200/50 rounded-[2rem] overflow-hidden shadow-sm">
            {data?.data.map((question) => (
              <div 
                key={question.id} 
                className="group relative flex items-center justify-between p-4 hover:bg-gray-50/80 transition-all cursor-pointer border-b border-gray-100 last:border-0"
                onClick={() => router.push(`/questions/${question.id}`)}
              >
                <div className="flex-1 min-w-0 flex items-center gap-4">
                  {/* Status Indicator Dot */}
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    question.status === 'published' ? "bg-emerald-400" : "bg-gray-300"
                  )} />
                  
                  <div className="flex flex-col min-w-0">
                    <span className="text-[15px] font-bold text-gray-900 truncate leading-none">
                      {getLocalizedText(question.prompt, 'Untitled Question')}
                    </span>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-lg">
                        <Layers className="w-3 h-3 text-gray-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          {getCategoryName(question.category_id)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-lg">
                        {question.type === 'mcq_single' ? <LayoutList className="w-3 h-3 text-gray-400" /> : <FileText className="w-3 h-3 text-gray-400" />}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          {QUESTION_TYPE_LABELS[question.type]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-1.5">
                        <Zap className={cn("w-3 h-3", difficultyVariant(question.difficulty))} />
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", difficultyVariant(question.difficulty))}>
                          {question.difficulty}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 ml-4">
                  <Badge 
                    className={cn(
                      "text-[10px] uppercase tracking-widest font-black px-3 py-1 rounded-lg border",
                      statusVariant(question.status)
                    )}
                  >
                    {QUESTION_STATUS_LABELS[question.status]}
                  </Badge>

                  {/* Actions - visible on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200" onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-xl hover:bg-white hover:shadow-sm text-gray-400 hover:text-gray-900"
                      onClick={() => router.push(`/questions/${question.id}`)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-white hover:shadow-sm text-gray-400 hover:text-gray-900">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-white/95 backdrop-blur-xl border-gray-200 shadow-2xl rounded-2xl p-1.5">
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'published')} disabled={question.status === 'published'} className="rounded-lg gap-2 font-medium">
                          <Send className="h-4 w-4 text-emerald-500" /> Publish
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'draft')} disabled={question.status === 'draft'} className="rounded-lg gap-2 font-medium">
                          <Clock className="h-4 w-4 text-gray-400" /> Move to Draft
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'archived')} disabled={question.status === 'archived'} className="rounded-lg gap-2 font-medium">
                          <Archive className="h-4 w-4 text-slate-400" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1.5 bg-gray-100" />
                        <DropdownMenuItem className="text-rose-500 focus:text-rose-600 focus:bg-rose-50 rounded-lg gap-2 font-bold" onClick={() => setDeleteId(question.id)}>
                          <Trash2 className="h-4 w-4" /> Delete Permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this question? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteQuestion.isPending}
            >
              {deleteQuestion.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
