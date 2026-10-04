import type { Metadata } from 'next';
import { TdCategoriesTab } from '@/components/td/tabs/categories-tab';
import { TdTabGate } from '@/components/td/td-tab-gate';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('categories').label };

export default function Page() {
  return (
    <TdTabGate tab="categories">
      <TdCategoriesTab />
    </TdTabGate>
  );
}
