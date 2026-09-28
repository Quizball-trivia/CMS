import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('round-3').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="round-3"
      sectionTitle="Categories"
      columns={['Category', 'Questions', 'With image', 'Status', 'Updated']}
      emptyTitle="No question categories yet"
    />
  );
}
