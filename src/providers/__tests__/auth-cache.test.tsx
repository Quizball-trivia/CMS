import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../auth-provider";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services", () => ({
  authService: { logout: vi.fn().mockResolvedValue(undefined) },
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it.each(["logout", "expired"])("clears retained data on %s", async (action) => {
  const client = new QueryClient();
  const { result } = renderHook(useAuth, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  client.setQueryData(["private-data"], { owner: "previous-admin" });
  await act(async () => {
    if (action === "logout") await result.current.logout();
    else window.dispatchEvent(new Event("auth:session-expired"));
  });
  expect(client.getQueryData(["private-data"])).toBeUndefined();
  client.clear();
});
