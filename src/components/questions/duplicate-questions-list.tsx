'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useDuplicateQuestions, useDeleteQuestion } from '@/hooks';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, CheckCircle, AlertCircle, Layers, Loader2 } from 'lucide-react';
import { QuestionDialog } from './question-dialog';

export interface DuplicateQuestionsListProps {
  type: 'all' | 'same_category' | 'cross_category';
  onTypeChange: (type: 'all' | 'same_category' | 'cross_category') => void;
}

export function DuplicateQuestionsList({ type, onTypeChange }: DuplicateQuestionsListProps) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const deleteQuestion = useDeleteQuestion();

  const { data: duplicatesData, isLoading, error } = useDuplicateQuestions(
    { type: type === 'all' ? undefined : type },
    { enabled: true }
  );

  const handleDelete = async (questionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening dialog

    if (!confirm('Delete this question?')) return;

    try {
      setDeletingQuestionId(questionId);
      await deleteQuestion.mutateAsync(questionId);
      toast.success('Question deleted');
    } catch (error) {
      logger.error('questions', 'Failed to delete duplicate question', {
        error: error instanceof Error ? error.message : error,
        questionId,
      });
      toast.error('Failed to delete question');
    } finally {
      setDeletingQuestionId(null);
    }
  };

  const typeConfig = {
    same_category: {
      label: 'Same Category',
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: AlertCircle,
    },
    cross_category: {
      label: 'Cross-Category',
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      icon: Layers,
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load duplicate questions. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  const groups = duplicatesData?.groups || [];

  if (groups.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900">No Duplicates Found</h3>
        <p className="text-sm text-gray-500 mt-1">All questions have unique prompts</p>
      </div>
    );
  }

  // Flatten all questions for the dialog
  const allQuestions = groups.flatMap(g => g.questions);
  const selectedQuestion = allQuestions.find(q => q.id === selectedQuestionId);
  const selectedIndex = allQuestions.findIndex(q => q.id === selectedQuestionId);

  return (
    <div className="space-y-6">
      {/* Type Filter */}
      <div className="flex items-center gap-4">
        <p className="text-sm font-medium text-gray-700">Filter by type:</p>
        <Select value={type} onValueChange={onTypeChange}>
          <SelectTrigger className="w-56 h-10 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">All Duplicates</SelectItem>
            <SelectItem value="same_category">🔴 Same Category</SelectItem>
            <SelectItem value="cross_category">🟠 Cross-Category</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-500">
          {groups.length} {groups.length === 1 ? 'group' : 'groups'} found
        </p>
      </div>

      {/* Duplicate Groups */}
      {groups.map((group) => {
        const config = typeConfig[group.type];
        const Icon = config.icon;

        return (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-2 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Group Header */}
            <div className="mb-4 flex items-center gap-3">
              <Badge className={`${config.color} border px-3 py-1`}>
                <Icon className="w-3.5 h-3.5 mr-1.5" />
                {config.label}
              </Badge>
              <span className="text-sm font-semibold text-gray-700">
                {group.count} {group.count === 1 ? 'duplicate' : 'duplicates'}
              </span>
              {group.categories.length > 0 && (
                <span className="text-xs text-gray-500">
                  in {group.categories.map(c => c.name || 'Untitled').join(', ')}
                </span>
              )}
            </div>

            {/* Question Prompt */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Duplicate Question:
              </p>
              <p className="text-sm font-medium text-gray-900 leading-relaxed">
                {group.prompt}
              </p>
            </div>

            {/* Questions List */}
            <div className="space-y-2">
              {group.questions.map((question) => {
                const category = group.categories.find(c => c.id === question.category_id);
                const categoryName = category?.name || '';

                return (
                  <motion.div
                    key={question.id}
                    onClick={() => setSelectedQuestionId(question.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 cursor-pointer transition-all group"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    {/* Status Dot */}
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      question.status === 'published' ? "bg-emerald-400 shadow-sm" : "bg-gray-300"
                    )} />

                    {/* Question Info */}
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      {categoryName && (
                        <Badge variant="outline" className="text-xs font-medium">
                          {categoryName}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-medium",
                          question.difficulty === 'easy' && "text-emerald-600 border-emerald-300",
                          question.difficulty === 'medium' && "text-amber-600 border-amber-300",
                          question.difficulty === 'hard' && "text-rose-600 border-rose-300"
                        )}
                      >
                        {question.difficulty}
                      </Badge>
                      <Badge
                        variant={question.status === 'published' ? 'default' : 'secondary'}
                        className="text-xs font-medium"
                      >
                        {question.status}
                      </Badge>
                    </div>

                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={(e) => handleDelete(question.id, e)}
                      disabled={deletingQuestionId === question.id}
                    >
                      {deletingQuestionId === question.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })}

      {/* Question Preview Dialog */}
      {selectedQuestionId && selectedQuestion && (
        <QuestionDialog
          mode="view"
          question={selectedQuestion}
          allQuestions={allQuestions}
          currentIndex={selectedIndex}
          onNavigate={(newIndex) => {
            if (allQuestions[newIndex]) {
              setSelectedQuestionId(allQuestions[newIndex].id);
            }
          }}
          totalAvailable={allQuestions.length}
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedQuestionId(null);
          }}
        />
      )}
    </div>
  );
}
