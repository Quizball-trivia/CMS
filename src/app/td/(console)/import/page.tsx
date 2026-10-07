import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdImportTab } from '@/components/td/tabs/import-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('import').label };

export default function TdImportPage() {
  return (
    <TdTabPage tab="import">
      <TdImportTab />
    </TdTabPage>
  );
}
