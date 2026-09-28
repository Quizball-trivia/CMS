import type { Metadata } from 'next';
import { TdTabPlaceholder } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('import').label };

export default function Page() {
  return (
    <TdTabPlaceholder
      tabKey="import"
      sectionTitle="Import batches"
      columns={['Batch', 'File', 'Rows', 'Result', 'Imported by', 'When']}
      emptyTitle="No imports yet"
    />
  );
}
