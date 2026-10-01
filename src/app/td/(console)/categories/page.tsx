import type { Metadata } from 'next';
import { TdTabPage } from '@/components/td/td-page';
import { TdCategoriesTab } from '@/components/td/tabs/categories-tab';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('categories').label };

export default function Page() {
  return (
    <TdTabPage tab="categories">
      <TdCategoriesTab />
    </TdTabPage>
  );
}
