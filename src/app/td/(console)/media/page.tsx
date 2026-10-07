import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdMediaTab } from '@/components/td/tabs/library-tabs';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('media').label };

export default function Page() {
  return (
    <TdTabPage tab="media">
      <TdMediaTab />
    </TdTabPage>
  );
}
