import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('round-2').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="round-2"
      sectionTitle="Subjects"
      columns={['Subject', 'Clues', 'Answer', 'Status', 'Updated']}
      emptyTitle="No subjects yet"
    />
  );
}
