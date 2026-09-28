import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('penalties').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="penalties"
      sectionTitle="Penalty pool"
      columns={['Question', 'Answer', 'Status', 'Updated']}
      emptyTitle="No penalty questions yet"
    />
  );
}
