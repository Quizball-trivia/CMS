import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdReleasesTab } from '@/components/td/tabs/releases-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('releases').label };

export default function TdReleasesPage() {
  return (
    <TdTabPage tab="releases">
      <TdReleasesTab />
    </TdTabPage>
  );
}
