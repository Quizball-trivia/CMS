import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdWriterTab } from '@/components/td/tabs/writer-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('writer').label };

export default function TdWriterPage() {
  return (
    <TdTabPage tab="writer">
      <TdWriterTab />
    </TdTabPage>
  );
}
