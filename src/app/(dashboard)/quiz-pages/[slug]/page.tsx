'use client';

import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { QuizPageEditor } from '@/components/quiz-pages';
import { useQuizPage } from '@/hooks';

export default function EditQuizPage() {
  const params = useParams<{ slug: string }>();
  const { data, isLoading, error } = useQuizPage(params.slug);

  if (isLoading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-8 animate-spin text-blue-600" /></div>;
  if (error || !data) return <div className="grid min-h-[60vh] place-items-center text-sm font-bold text-red-600">This quiz page could not be loaded.</div>;
  return <QuizPageEditor existing={data} />;
}
