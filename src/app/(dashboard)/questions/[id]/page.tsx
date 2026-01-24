'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuestion } from '@/hooks';
import { getLocalizedText } from '@/lib/utils';
import { QuestionForm } from '@/components/questions';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 line-clamp-1">{prompt}</h1>
          <p className="text-gray-500">Edit question details</p>
        </div>
      </div>

      <QuestionForm question={question} onSuccess={() => router.push('/questions')} />
    </div>
  );
}
