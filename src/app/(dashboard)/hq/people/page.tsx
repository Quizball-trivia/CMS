'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useHqMembers, useSyncHqHumans } from '@/hooks';
import { cn } from '@/lib/utils';
import { EmptyState, HQ_PAGE, LoadErrorState, PageHeader, RefreshErrorBanner, errorMessage } from '../hq-ui';
import { MemberCard } from '../team/member-card';
import { TeamTabs } from '../team/team-tabs';

// The people on the team (CMS admins). Agents have their own page (/hq/team).
export default function HqPeoplePage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading, error, refetch } = useHqMembers(includeArchived);
  const people = (data ?? []).filter((m) => m.kind === 'human').sort((x, y) => x.name.localeCompare(y.name));
  const sync = useSyncHqHumans();

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow={<TeamTabs active="people" />}
        title="People"
        description={`${people.length} ${people.length === 1 ? 'person' : 'people'} on the team.`}
        actions={
          <Button
            variant="outline"
            disabled={sync.isPending}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (res) => toast.success(`Staff synced — ${res.items.length} people`),
                onError: (e) => toast.error(errorMessage(e, 'Could not sync staff')),
              })
            }
          >
            <RefreshCw className={cn('h-4 w-4', sync.isPending && 'animate-spin')} /> Sync staff
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={includeArchived} onCheckedChange={(v) => setIncludeArchived(v === true)} />
          Show archived
        </label>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>

      {error && !data && <LoadErrorState error={error} fallback="Could not load the people." onRetry={() => void refetch()} />}
      {error && data && <RefreshErrorBanner />}

      {data &&
        (people.length === 0 ? (
          <EmptyState>No people yet.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((m) => (
              <MemberCard key={m.id} member={m} />
            ))}
          </div>
        ))}
    </div>
  );
}
