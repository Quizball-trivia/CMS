import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdPracticeTab } from '@/components/td/tabs/library-tabs';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('practice').label };

export default function Page() {
  return (
    <TdTabPage tab="practice">
      <TdPracticeTab />
    </TdTabPage>
  );
}
