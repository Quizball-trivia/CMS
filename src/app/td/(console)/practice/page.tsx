import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('practice').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="practice"
      sectionTitle="Question bank"
      columns={['Question', 'Difficulty', 'Status', 'Updated']}
      emptyTitle="No practice questions yet"
    />
  );
}
