import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('round-1').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="round-1"
      sectionTitle="Categories"
      columns={['Category', 'Cards', 'Values 1 / 2 / 3', 'Status', 'Updated']}
      emptyTitle="No card categories yet"
    />
  );
}
