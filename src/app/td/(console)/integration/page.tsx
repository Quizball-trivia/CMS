import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdIntegrationTab } from '@/components/td/tabs/integration-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('integration').label };

export default function TdIntegrationPage() {
  return (
    <TdTabPage tab="integration">
      <TdIntegrationTab />
    </TdTabPage>
  );
}
