'use client';

import { useRouter } from 'next/navigation';
import { QuestionList } from '@/components/questions';
import { Button } from '@/components/ui/button';

export default function QuestionsPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Questions</h1>
          <p className="text-gray-500">Manage quiz questions</p>
        </div>

        <Button onClick={() => router.push('/questions/new')}>
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Question
        </Button>
      </div>

      <QuestionList />
    </div>
  );
}
