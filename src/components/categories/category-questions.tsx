'use client';

import { useState } from 'react';
import { useQuestions } from '@/hooks';
import { QuestionDialog } from '../questions/question-dialog';
import { cn, getLocalizedText } from '@/lib/utils';
import { FileText, LayoutList } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CategoryQuestionsProps {
  categoryId: string;
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'easy':
      return 'text-emerald-500';
    case 'medium':
      return 'text-amber-500';
    case 'hard':
      return 'text-rose-500';
    default:
      return 'text-gray-400';
  }
};

const DifficultyDots = ({ difficulty }: { difficulty: string }) => {
  const dots = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  const color = getDifficultyColor(difficulty).replace('text-', 'bg-');

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((dot) => (
        <div
          key={dot}
          className={cn(
            "w-1 h-1 rounded-full transition-colors",
            dot <= dots ? color : "bg-gray-200"
          )}
        />
      ))}
    </div>
  );
};

export function CategoryQuestions({ categoryId }: CategoryQuestionsProps) {
  const { data, isLoading } = useQuestions({ category_id: categoryId, limit: 50 });
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  const questions = data?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
          Questions ({0})
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
          Questions ({0})
        </div>
        <Alert className="rounded-xl bg-gray-50 border-gray-100">
          <AlertDescription className="text-xs text-gray-500">
            No questions in this category yet.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedQuestion = questions.find(q => q.id === selectedQuestionId);
  const selectedIndex = questions.findIndex(q => q.id === selectedQuestionId);

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
        Questions ({questions.length})
      </div>

      <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {questions.map((question) => (
          <div
            key={question.id}
            onClick={() => setSelectedQuestionId(question.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                if (event.key === ' ') {
                  event.preventDefault();
                }
                setSelectedQuestionId(question.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedQuestionId === question.id}
            className="group flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200 transition-all cursor-pointer"
          >
            {/* Status Dot */}
            <div className={cn(
              "w-1 h-1 rounded-full shrink-0",
              question.status === 'published' ? "bg-emerald-400" : "bg-gray-300"
            )} />

            {/* Question Content */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">
                {getLocalizedText(question.prompt, 'Untitled Question')}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="flex items-center gap-0.5">
                  {question.type === 'mcq_single' ?
                    <LayoutList className="w-2.5 h-2.5 text-gray-400" /> :
                    <FileText className="w-2.5 h-2.5 text-gray-400" />
                  }
                  <span className="text-[8px] font-medium text-gray-400 uppercase">
                    {question.type === 'mcq_single' ? 'MCQ' : 'Text'}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <DifficultyDots difficulty={question.difficulty} />
                  <span className={cn("text-[8px] font-bold uppercase", getDifficultyColor(question.difficulty))}>
                    {question.difficulty}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Badge */}
            <div className={cn(
              "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0",
              question.status === 'published'
                ? "bg-emerald-50 text-emerald-600"
                : "bg-gray-100 text-gray-400"
            )}>
              {question.status}
            </div>
          </div>
        ))}
      </div>

      {/* Question Preview Dialog */}
      {selectedQuestionId && selectedQuestion && (
        <QuestionDialog
          mode="view"
          question={selectedQuestion}
          allQuestions={questions}
          currentIndex={selectedIndex}
          onNavigate={(newIndex) => {
            if (questions[newIndex]) {
              setSelectedQuestionId(questions[newIndex].id);
            }
          }}
          totalAvailable={data?.total || 0}
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedQuestionId(null);
          }}
        />
      )}
    </div>
  );
}
