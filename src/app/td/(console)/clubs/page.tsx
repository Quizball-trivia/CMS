import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('clubs').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="clubs"
      sectionTitle="Clubs"
      columns={['Crest', 'Club', 'Country', 'Used by', 'Updated']}
      emptyTitle="No clubs yet"
    />
  );
}
