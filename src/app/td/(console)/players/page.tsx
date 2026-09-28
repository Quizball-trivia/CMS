import type { Metadata } from 'next';
import { Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TD_NOT_BUILT_YET, TdPageHeader, TdPlaceholderTable, TdSection } from '@/components/td/td-page';
import { getTab } from '@/lib/td/navigation';

export const metadata: Metadata = { title: getTab('players').label };

export default function TdPlayersPage() {
  return (
    <>
      <TdPageHeader tabKey="players" />
      <TdSection
        title="Players"
        actions={
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--td-text-3)" />
            <Input disabled placeholder="Nickname or Betsson id" className="h-10 rounded-full bg-(--td-input) pl-9" />
          </div>
        }
      >
        <TdPlaceholderTable
          columns={['Nickname', 'Betsson id', 'Matches', 'Rating', 'Last seen', 'Status']}
          icon={Users}
          emptyTitle="No players yet"
          emptyBody={TD_NOT_BUILT_YET}
        />
      </TdSection>
    </>
  );
}
