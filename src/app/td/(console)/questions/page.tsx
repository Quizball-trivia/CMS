import type { Metadata } from 'next';
import { TdTabGate } from '@/components/td/td-tab-gate';
import { TdQuestionsTab } from '@/components/td/tabs/questions-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('questions').label };

// The page draws its own heading, as the Quizball CMS's Questions page does.
export default function Page() {
  return (
    <TdTabGate tab="questions">
      <TdQuestionsTab />
    </TdTabGate>
  );
}
