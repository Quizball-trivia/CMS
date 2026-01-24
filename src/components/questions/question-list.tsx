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
  AlertCircle
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
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'draft':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'archived':
        return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const difficultyVariant = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'medium':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'hard':
        return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      default:
        return 'bg-muted text-muted-foreground';
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
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Search & Filter Bar */}
      <Card className="border-white/10 shadow-xl bg-card/40 backdrop-blur-md">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[300px] relative group">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Search questions by text or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 bg-background/50 border-white/5 focus-visible:ring-2 focus-visible:ring-primary/20 transition-all backdrop-blur-sm"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              <Select
                value={params.category_id || 'all'}
                onValueChange={(v) => handleFilterChange('category_id', v)}
              >
                <SelectTrigger className="w-[160px] bg-background/50 border-white/5 h-9 text-xs font-medium backdrop-blur-sm">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent className="bg-card/95 backdrop-blur-xl border-white/10">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {getLocalizedText(cat.name, cat.slug)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={params.status || 'all'}
                onValueChange={(v) => handleFilterChange('status', v)}
              >
                <SelectTrigger className="w-[120px] bg-background/50 border-white/5 h-9 text-xs font-medium backdrop-blur-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-card/95 backdrop-blur-xl border-white/10">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={params.difficulty || 'all'}
                onValueChange={(v) => handleFilterChange('difficulty', v)}
              >
                <SelectTrigger className="w-[120px] bg-background/50 border-white/5 h-9 text-xs font-medium backdrop-blur-sm">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent className="bg-card/95 backdrop-blur-xl border-white/10">
                  <SelectItem value="all">All Difficulty</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>

              <Button 
                variant="default" 
                size="sm" 
                onClick={handleSearch}
                className="h-9 px-4 shadow-lg shadow-primary/20 active:scale-95 transition-all bg-primary/90 hover:bg-primary backdrop-blur-sm"
              >
                Apply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Section */}
      <div className="bg-card/40 backdrop-blur-md rounded-xl border border-white/10 shadow-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-white/5">
            <TableRow className="hover:bg-transparent border-white/5">
              <TableHead className="w-[50%] font-bold text-xs uppercase tracking-wider py-4">Question Content</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider py-4">Category</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider py-4 text-center">Config</TableHead>
              <TableHead className="font-bold text-xs uppercase tracking-wider py-4">Status</TableHead>
              <TableHead className="w-[60px] py-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="py-8">
                    <div className="h-10 bg-white/5 rounded-lg animate-pulse" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center justify-center space-y-3 text-muted-foreground">
                    <HelpCircle className="h-12 w-12 opacity-20" />
                    <p className="text-sm font-medium">No questions match your criteria.</p>
                    <Button variant="link" onClick={() => setParams({ page: 1, limit: 10 })} className="text-primary text-xs">
                      Clear all filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((question) => (
                <TableRow 
                  key={question.id} 
                  className="group cursor-pointer hover:bg-white/5 transition-colors border-white/5"
                  onClick={() => router.push(`/questions/${question.id}`)}
                >
                  <TableCell className="py-4">
                    <div className="flex flex-col space-y-1">
                      <span className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                        {getLocalizedText(question.prompt, 'No prompt')}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        ID: {question.id.substring(0, 8)}...
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2 text-primary/80">
                      <div className="w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                      <span className="text-xs font-medium">{getCategoryName(question.category_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 h-4 border-white/10 bg-primary/5 text-primary/90">
                        {question.type === 'mcq_single' ? <LayoutList className="w-2.5 h-2.5 mr-1" /> : <FileText className="w-2.5 h-2.5 mr-1" />}
                        {QUESTION_TYPE_LABELS[question.type]}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0 h-4 border-white/10",
                          difficultyVariant(question.difficulty)
                        )}
                      >
                        {DIFFICULTY_LABELS[question.difficulty]}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge 
                      className={cn(
                        "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 border border-white/10 h-5",
                        statusVariant(question.status)
                      )}
                    >
                      {QUESTION_STATUS_LABELS[question.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 bg-card/95 backdrop-blur-xl border-white/10 shadow-2xl">
                        <DropdownMenuItem onClick={() => router.push(`/questions/${question.id}`)} className="cursor-pointer">
                          <Edit2 className="h-4 w-4 mr-2" /> Edit Question
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/5" />
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'published')} disabled={question.status === 'published'} className="cursor-pointer">
                          <Send className="h-4 w-4 mr-2 text-emerald-500" /> Publish
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'draft')} disabled={question.status === 'draft'} className="cursor-pointer">
                          <Clock className="h-4 w-4 mr-2 text-amber-500" /> Move to Draft
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(question.id, 'archived')} disabled={question.status === 'archived'} className="cursor-pointer">
                          <Archive className="h-4 w-4 mr-2 text-slate-500" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/5" />
                        <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer" onClick={() => setDeleteId(question.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete Permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
