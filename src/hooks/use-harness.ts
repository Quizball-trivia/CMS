import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { harnessApi } from '@/lib/harness-api';
import { categoryKeys } from './use-categories';
import type { HarnessCreateEvent, HarnessCreateRequest, HarnessIdeaKind, HarnessItemAction, HarnessMarket, HarnessPriority, HarnessUpdateSettingsRequest } from '@/types';

// The Content tab polls: agents work in the background.
export const HARNESS_REFETCH_MS = 10_000;

export const harnessKeys = {
  all: ['harness'] as const,
  overview: () => [...harnessKeys.all, 'overview'] as const,
};

/** The Games hub. Its play counts are recomputed every five minutes on the server, so it refreshes at that pace. */
export function useHarnessGames() {
  return useQuery({ queryKey: [...harnessKeys.all, 'games'] as const, queryFn: () => harnessApi.games(), refetchInterval: 300_000, staleTime: 60_000 });
}

export function useHarnessOverview() {
  return useQuery({ queryKey: harnessKeys.overview(), queryFn: () => harnessApi.overview(), refetchInterval: HARNESS_REFETCH_MS });
}

export function useUpdateHarnessSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: HarnessUpdateSettingsRequest) => harnessApi.updateSettings(body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: harnessKeys.all }),
  });
}

export function useSetHarnessPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; value: unknown }) => harnessApi.setPolicy(v.key, v.value),
    onSettled: () => queryClient.invalidateQueries({ queryKey: harnessKeys.all }),
  });
}

/** Every steering action refreshes the tab, so what you changed shows at once. */
function useHarnessMutation<V, R>(fn: (v: V) => Promise<R>, opts: { touchesCategories?: boolean; mutationKey?: readonly string[] } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: opts.mutationKey,
    mutationFn: fn,
    // Returned, so the button stays busy until the fresh data is on screen: no second click on a stale card.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: harnessKeys.all }),
        // Creating or launching a category changes the Categories page too.
        opts.touchesCategories ? queryClient.invalidateQueries({ queryKey: categoryKeys.all }) : Promise.resolve(),
      ]),
  });
}

export function useSetHarnessSteering() {
  return useHarnessMutation((v: { categoryId: string; priority?: HarnessPriority; direction?: string; market?: HarnessMarket }) =>
    harnessApi.setSteering(v.categoryId, { priority: v.priority, direction: v.direction, market: v.market })
  );
}

export function useSetHarnessDirection() {
  return useHarnessMutation((direction: string) => harnessApi.setDirection(direction));
}

export function useCreateHarnessRequest() {
  return useHarnessMutation((body: HarnessCreateRequest) => harnessApi.createRequest(body));
}

export function useCancelHarnessRequest() {
  return useHarnessMutation((id: string) => harnessApi.cancelRequest(id));
}

export function useHarnessItemAction() {
  return useHarnessMutation((v: { itemId: string; action: HarnessItemAction; version: number; note?: string }) =>
    harnessApi.itemAction(v.itemId, { action: v.action, version: v.version, note: v.note })
  );
}

export function useCreateHarnessEvent() {
  return useHarnessMutation((body: HarnessCreateEvent) => harnessApi.createEvent(body));
}

export function useCancelHarnessEvent() {
  return useHarnessMutation((id: string) => harnessApi.cancelEvent(id));
}

export function useCreateHarnessProposal() {
  return useHarnessMutation((body: { name: string; why?: string; target?: number; market?: HarnessMarket }) => harnessApi.createProposal(body), { touchesCategories: true });
}

export function useHarnessProposalGoLive() {
  return useHarnessMutation((id: string) => harnessApi.proposalGoLive(id), { touchesCategories: true });
}

export function useCancelHarnessProposal() {
  return useHarnessMutation((id: string) => harnessApi.cancelProposal(id));
}

export function useCreateHarnessIdea() {
  return useHarnessMutation((body: { text: string; market: HarnessMarket; kind: HarnessIdeaKind }) => harnessApi.createIdea(body));
}

export function useScoutHarnessIdeas() {
  return useHarnessMutation((market: HarnessMarket) => harnessApi.scoutIdeas(market));
}

/** Accepting may start a new category, so the category lists are refreshed too. */
export function useAcceptHarnessIdea() {
  return useHarnessMutation((id: string) => harnessApi.acceptIdea(id), { touchesCategories: true });
}

export function useRefuseHarnessIdea() {
  return useHarnessMutation((v: { id: string; reason: string }) => harnessApi.refuseIdea(v.id, v.reason));
}

export function useCreateHarnessAsk() {
  return useHarnessMutation((message: string) => harnessApi.createAsk(message));
}

export function useApplyHarnessAsk() {
  return useHarnessMutation((v: { id: string; indexes: number[] }) => harnessApi.applyAsk(v.id, v.indexes));
}

export function useDismissHarnessAsk() {
  return useHarnessMutation((id: string) => harnessApi.dismissAsk(id));
}

// Every change to the show pack shares one key, so the page knows one is in flight even after its buttons were
// unmounted and mounted again (leaving the tab and coming back).
const SHOW_CHANGE = { mutationKey: ['harness', 'show-change'] as const };

/** A swap, rebuild or approval of the show pack is on its way (and the fresh data not yet on screen). */
export function useShowPackChanging(): boolean {
  return useIsMutating({ mutationKey: SHOW_CHANGE.mutationKey }) > 0;
}

export function useSwapShowQuestion() {
  return useHarnessMutation((v: { id: string; index: number; seen: string }) => harnessApi.swapShowQuestion(v.id, v.index, v.seen), SHOW_CHANGE);
}

export function useNewShowPack() {
  return useHarnessMutation((id: string) => harnessApi.newShowPack(id), SHOW_CHANGE);
}

export function useApproveShowPack() {
  return useHarnessMutation((v: { id: string; seen: string }) => harnessApi.approveShowPack(v.id, v.seen), SHOW_CHANGE);
}

// ── Changes to a game ──

/** Polls while the planner is working, so a plan appears by itself; otherwise once a minute. */
export function useHarnessGameChanges() {
  return useQuery({
    queryKey: [...harnessKeys.all, 'game-changes'] as const,
    queryFn: async () => (await harnessApi.gameChanges()).items,
    refetchInterval: (q) => (q.state.data?.some((c) => c.status === 'planning' || c.status === 'building') ? HARNESS_REFETCH_MS : 60_000),
  });
}

export function useCreateGameChange() {
  return useHarnessMutation((body: { gameKey: string; title: string; request: string }) => harnessApi.createGameChange(body));
}

export function useReplanGameChange() {
  return useHarnessMutation((v: { id: string; request: string }) => harnessApi.replanGameChange(v.id, v.request));
}

export function useCancelGameChange() {
  return useHarnessMutation((id: string) => harnessApi.cancelGameChange(id));
}

/** What the desk agents wrote. Refreshes quickly while one is being written. */
export function useHarnessReports() {
  return useQuery({
    queryKey: [...harnessKeys.all, 'reports'] as const,
    queryFn: () => harnessApi.reports(),
    refetchInterval: (q) => (q.state.data?.items.some((r) => r.status === 'writing') ? HARNESS_REFETCH_MS : 60_000),
  });
}

export function useCreateReport() {
  return useHarnessMutation((agent: string) => harnessApi.createReport(agent));
}

export function useArchiveReport() {
  return useHarnessMutation((id: string) => harnessApi.archiveReport(id));
}
