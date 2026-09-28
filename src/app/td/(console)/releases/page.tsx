import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('releases').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="releases"
      sectionTitle="Releases"
      columns={['Release', 'Published', 'By', 'Changes', 'Validation']}
      emptyTitle="Nothing has been published yet"
    />
  );
}
