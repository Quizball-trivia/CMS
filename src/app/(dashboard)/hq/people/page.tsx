'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useHqMembers, useSyncHqHumans } from '@/hooks';
import { cn } from '@/lib/utils';
import { EmptyState, LoadErrorState, PageHeader, RefreshErrorBanner, errorMessage } from '../hq-ui';
import { MemberCard } from '../team/member-card';

// The people on the team (CMS admins). Agents have their own page (/hq/team).
export default function HqPeoplePage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading, error, refetch } = useHqMembers(includeArchived);
  const people = (data ?? []).filter((m) => m.kind === 'human').sort((x, y) => x.name.localeCompare(y.name));
  const sync = useSyncHqHumans();

  return (
    <div className="mx-auto max-w-7xl space-y-10 pb-16">
      <PageHeader
        icon={<Users className="h-6 w-6 text-slate-700" />}
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

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={includeArchived} onCheckedChange={(v) => setIncludeArchived(v === true)} />
          Show archived
        </label>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {error && !data && <LoadErrorState error={error} fallback="Could not load the people." onRetry={() => void refetch()} />}
      {error && data && <RefreshErrorBanner />}

      {data &&
        (people.length === 0 ? (
          <EmptyState>No people yet.</EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((m) => (
              <MemberCard key={m.id} member={m} />
            ))}
          </div>
        ))}
    </div>
  );
}
