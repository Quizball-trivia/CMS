'use client';

import { useRouter } from 'next/navigation';
import { QuestionList } from '@/components/questions';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function QuestionsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-foreground py-10">
      <div className="max-w-[1280px] mx-auto px-8 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <header className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-gray-900">Questions</h1>
            <p className="text-gray-500 font-medium text-base">Manage and curate your quiz questions library.</p>
          </header>

          <Button 
            onClick={() => router.push('/questions/new')}
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 h-11 rounded-xl font-bold text-sm transition-all shadow-lg shadow-gray-200 active:scale-95 flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Question
          </Button>
        </div>

        <QuestionList />
      </div>
    </div>
  );
}
