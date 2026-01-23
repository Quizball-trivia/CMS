'use client';

import { useRouter } from 'next/navigation';
import { QuestionForm } from '@/components/questions';
import { Button } from '@/components/ui/button';

export default function NewQuestionPage() {
  const router = useRouter();

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
          <h1 className="text-2xl font-bold text-gray-900">New Question</h1>
          <p className="text-gray-500">Create a new quiz question</p>
        </div>
      </div>

      <QuestionForm onSuccess={() => router.push('/questions')} />
    </div>
  );
}
