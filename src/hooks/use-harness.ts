import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { harnessApi } from '@/lib/harness-api';
import type { HarnessCreateEvent, HarnessCreateRequest, HarnessItemAction, HarnessPriority, HarnessUpdateSettingsRequest } from '@/types';

// The Content tab polls: agents work in the background.
export const HARNESS_REFETCH_MS = 10_000;

export const harnessKeys = {
  all: ['harness'] as const,
  overview: () => [...harnessKeys.all, 'overview'] as const,
};

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
function useHarnessMutation<V, R>(fn: (v: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: harnessKeys.all }) });
}

export function useSetHarnessSteering() {
  return useHarnessMutation((v: { categoryId: string; priority?: HarnessPriority; direction?: string }) =>
    harnessApi.setSteering(v.categoryId, { priority: v.priority, direction: v.direction })
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
  return useHarnessMutation((body: { name: string; why?: string; target?: number }) => harnessApi.createProposal(body));
}

export function useHarnessProposalGoLive() {
  return useHarnessMutation((id: string) => harnessApi.proposalGoLive(id));
}

export function useCancelHarnessProposal() {
  return useHarnessMutation((id: string) => harnessApi.cancelProposal(id));
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
