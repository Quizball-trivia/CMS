import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { freecrocoService } from '@/services';
import type {
  CalendarResponse,
  CalendarUpdate,
  DeliveriesQuery,
  PartnerGamesConfig,
  PartnerStaffList,
  RankedPointsUpdate,
  StaffAddRequest,
  StaffRole,
} from '@/types/freecroco';
import { logger } from '@/lib/logger';
import { getErrorLogDetails } from '@/lib/error-feedback';
import { applySavedChanges } from '@/lib/freecroco/calendar';
import { isNotResendable, isStaleVersion } from '@/lib/freecroco/errors';

export const freecrocoKeys = {
  all: ['freecroco'] as const,
  games: () => [...freecrocoKeys.all, 'games'] as const,
  calendars: () => [...freecrocoKeys.all, 'calendar'] as const,
  calendar: (from: string, to: string) => [...freecrocoKeys.calendars(), from, to] as const,
  rankedPoints: () => [...freecrocoKeys.all, 'ranked-points'] as const,
  deliveries: () => [...freecrocoKeys.all, 'deliveries'] as const,
  deliveryList: (query: Omit<DeliveriesQuery, 'cursor'>) => [...freecrocoKeys.deliveries(), query] as const,
  attempts: (eventId: string) => [...freecrocoKeys.deliveries(), 'attempts', eventId] as const,
  player: (playerId: string) => [...freecrocoKeys.all, 'player', playerId] as const,
  stats: (from: string, to: string) => [...freecrocoKeys.all, 'stats', from, to] as const,
  staff: () => [...freecrocoKeys.all, 'staff'] as const,
};

export function useFreecrocoGames() {
  return useQuery({
    queryKey: freecrocoKeys.games(),
    queryFn: () => freecrocoService.getGames(),
    // Always revalidate on mount so a draft pins a version that is current, not up to 30 s old.
    staleTime: 0,
    // A form is being edited against this version; refetching on focus would only churn it.
    refetchOnWindowFocus: false,
  });
}

export function useSaveFreecrocoGames() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: PartnerGamesConfig) => freecrocoService.putGames(config),
    onSuccess: (saved) => {
      // The saved config is the new truth: put it in the cache before the caller clears its draft, so the
      // form shows what was saved even if the confirming reload below fails.
      if (saved && typeof saved.version === 'number' && Array.isArray(saved.games)) {
        queryClient.setQueryData(freecrocoKeys.games(), saved);
      }
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.games() });
    },
    onError: (error) => {
      // Reload on a stale save so the user sees what the other editor saved.
      if (isStaleVersion(error)) return queryClient.invalidateQueries({ queryKey: freecrocoKeys.games() });
      logger.error('freecroco', 'Failed to save games', getErrorLogDetails(error));
    },
  });
}

export function useFreecrocoRankedPoints() {
  return useQuery({
    queryKey: freecrocoKeys.rankedPoints(),
    queryFn: () => freecrocoService.getRankedPoints(),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useSaveFreecrocoRankedPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: RankedPointsUpdate) => freecrocoService.putRankedPoints(update),
    onSuccess: (saved) => {
      // As for games: the saved table is shown even if the confirming reload below fails.
      if (saved && typeof saved.version === 'number' && saved.points) {
        queryClient.setQueryData(freecrocoKeys.rankedPoints(), saved);
      }
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.rankedPoints() });
    },
    onError: (error) => {
      if (isStaleVersion(error)) return queryClient.invalidateQueries({ queryKey: freecrocoKeys.rankedPoints() });
      logger.error('freecroco', 'Failed to save ranked points', getErrorLogDetails(error));
    },
  });
}

export function useFreecrocoCalendar(from: string, to: string) {
  return useQuery({
    queryKey: freecrocoKeys.calendar(from, to),
    queryFn: () => freecrocoService.getCalendar(from, to),
    // Months are revalidated when shown, so the version a draft pins is not a stale cached one.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useSaveFreecrocoCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: CalendarUpdate) => freecrocoService.putCalendar(update),
    onSuccess: (saved, update) => {
      // Write the saved result into every cached range that was loaded at the version this save was based
      // on, before the caller clears its draft, so the grid shows what was saved even if the confirming
      // reload below fails. Ranges at any other version are left for that reload to replace.
      if (saved && typeof saved.version === 'number') {
        for (const [queryKey, cached] of queryClient.getQueriesData<CalendarResponse>({ queryKey: freecrocoKeys.calendars() })) {
          if (!cached || cached.version !== update.version) continue;
          const [, , from, to] = queryKey as string[];
          queryClient.setQueryData(queryKey, applySavedChanges(cached, { from, to }, update.changes, saved.version));
        }
      }
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.calendars() });
    },
    onError: (error) => {
      if (isStaleVersion(error)) return queryClient.invalidateQueries({ queryKey: freecrocoKeys.calendars() });
      logger.error('freecroco', 'Failed to save calendar', getErrorLogDetails(error));
    },
  });
}

const RELOAD_ATTEMPTS = 3;
const RELOAD_RETRY_MS = 100;

/**
 * Refetches the given calendar ranges now. Resolves to their version only when every range reports the
 * same one, so the caller holds one consistent snapshot; ranges fetched across a concurrent save are
 * fetched again a few times, and null means they never agreed.
 */
export function useReloadFreecrocoCalendar() {
  const queryClient = useQueryClient();
  return async (ranges: Array<{ from: string; to: string }>): Promise<number | null> => {
    for (let attempt = 0; attempt < RELOAD_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RELOAD_RETRY_MS));
      const loaded = await Promise.all(
        ranges.map(({ from, to }) =>
          queryClient.fetchQuery({
            queryKey: freecrocoKeys.calendar(from, to),
            queryFn: () => freecrocoService.getCalendar(from, to),
            staleTime: 0,
          }),
        ),
      );
      const versions = new Set(loaded.map((c) => c.version));
      if (versions.size === 1) return loaded[0].version;
    }
    return null;
  };
}

export function useFreecrocoDeliveries(query: Omit<DeliveriesQuery, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: freecrocoKeys.deliveryList(query),
    queryFn: ({ pageParam }) => freecrocoService.listDeliveries({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useFreecrocoAttempts(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: freecrocoKeys.attempts(eventId),
    queryFn: () => freecrocoService.listAttempts(eventId),
    enabled,
  });
}

export function useResendFreecrocoDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => freecrocoService.resendDelivery(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: freecrocoKeys.deliveries() }),
    onError: (error) => {
      // Not dead any more: reload so the row shows its current status and loses the button.
      if (isNotResendable(error)) return queryClient.invalidateQueries({ queryKey: freecrocoKeys.deliveries() });
      logger.error('freecroco', 'Failed to resend delivery', getErrorLogDetails(error));
    },
  });
}

export function useFreecrocoPlayer(playerId: string | null) {
  return useQuery({
    queryKey: freecrocoKeys.player(playerId ?? ''),
    queryFn: () => freecrocoService.getPlayer(playerId!),
    enabled: Boolean(playerId),
    retry: false,
  });
}

export function useFreecrocoStats(from: string, to: string) {
  return useQuery({
    queryKey: freecrocoKeys.stats(from, to),
    queryFn: () => freecrocoService.getStats(from, to),
    staleTime: 60_000,
    // Keep the last range on screen while a new one loads.
    placeholderData: keepPreviousData,
  });
}

export function useFreecrocoStaff(enabled = true) {
  return useQuery({
    queryKey: freecrocoKeys.staff(),
    queryFn: () => freecrocoService.listStaff(),
    enabled,
  });
}

export function useAddFreecrocoStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: StaffAddRequest) => freecrocoService.addStaff(request),
    onSuccess: (result) => {
      queryClient.setQueryData<PartnerStaffList>(freecrocoKeys.staff(), (list) =>
        list ? { items: [...list.items.filter((m) => m.userId !== result.member.userId), result.member] } : list,
      );
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.staff() });
    },
    onError: (error) => logger.error('freecroco', 'Failed to add staff member', getErrorLogDetails(error)),
  });
}

export function useUpdateFreecrocoStaffRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: StaffRole }) => freecrocoService.updateStaffRole(userId, role),
    onSuccess: (member) => {
      queryClient.setQueryData<PartnerStaffList>(freecrocoKeys.staff(), (list) =>
        list ? { items: list.items.map((m) => (m.userId === member.userId ? member : m)) } : list,
      );
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.staff() });
    },
    onError: (error) => {
      // Already removed by someone else: reload so the row disappears.
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.staff() });
      logger.error('freecroco', 'Failed to change staff role', getErrorLogDetails(error));
    },
  });
}

export function useRemoveFreecrocoStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => freecrocoService.removeStaff(userId),
    onSuccess: (_result, userId) => {
      queryClient.setQueryData<PartnerStaffList>(freecrocoKeys.staff(), (list) =>
        list ? { items: list.items.filter((m) => m.userId !== userId) } : list,
      );
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.staff() });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: freecrocoKeys.staff() });
      logger.error('freecroco', 'Failed to remove staff member', getErrorLogDetails(error));
    },
  });
}
