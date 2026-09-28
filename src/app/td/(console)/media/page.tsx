import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('media').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="media"
      sectionTitle="Library"
      columns={['Preview', 'File', 'Licence', 'Credit', 'Source', 'Rights']}
      emptyTitle="No media uploaded yet"
    />
  );
}
