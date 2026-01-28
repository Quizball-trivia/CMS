'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuestion } from '@/hooks';
import { getLocalizedText } from '@/lib/utils';
import { QuestionForm } from '@/components/questions';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft } from 'lucide-react';

interface QuestionPageProps {
  params: Promise<{ id: string }>;
}

export default function QuestionPage({ params }: QuestionPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: question, isLoading, error } = useQuestion(resolvedParams.id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-96 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Alert variant="destructive">
          <AlertDescription>Question not found or failed to load.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const prompt = getLocalizedText(question.prompt, 'Untitled Question');

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-foreground py-10">
      <div className="max-w-[1280px] mx-auto px-8 space-y-8">
        {/* Page Header */}
        <div className="flex items-center gap-4 py-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:scale-110 transition-transform" />
            Back
          </Button>
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 line-clamp-1">
              {prompt}
            </h1>
            <p className="text-sm text-gray-400 font-medium">
              Edit question details
            </p>
          </div>
        </div>

        <QuestionForm key={question.id} question={question} onSuccess={() => router.push('/questions')} />
      </div>
    </div>
  );
}
