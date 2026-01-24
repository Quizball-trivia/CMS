'use client';

import { useRouter } from 'next/navigation';
import { QuestionForm } from '@/components/questions';
import { ArrowLeft } from 'lucide-react';

export default function NewQuestionPage() {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-4 py-2">
        <button 
          type="button" 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:scale-110 transition-transform" />
          Back
        </button>
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            New Question
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Create a new quiz question
          </p>
        </div>
      </div>

      <QuestionForm onSuccess={() => router.push('/questions')} />
    </div>
  );
}
