import type { Metadata } from 'next';
import { CalendarDays } from 'lucide-react';
import { TD_NOT_BUILT_YET, TdTabPage, TdPlaceholderTable, TdSection } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('dailies').label };

export default function TdDailiesPage() {
  return (
    <TdTabPage tab="dailies">
      <TdSection title="Calendar" description="One puzzle per mode for every Georgia date; releases check the next 30 days are filled.">
        <TdPlaceholderTable
          columns={['Date (Georgia)', 'Football Logic', 'Put in Order', 'Career Path']}
          icon={CalendarDays}
          emptyTitle="Nothing scheduled yet"
          emptyBody={TD_NOT_BUILT_YET}
        />
      </TdSection>
    </TdTabPage>
  );
}
