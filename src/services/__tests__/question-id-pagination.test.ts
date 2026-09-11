import { afterEach, expect, it, vi } from "vitest";
import { questionsService } from "../questions.service";
import { apiClient } from "../api-client";
vi.mock("../api-client", () => ({
  apiClient: { get: vi.fn() },
  ApiClientError: class extends Error {},
}));
afterEach(() => vi.clearAllMocks());
it("loads remaining ID pages concurrently with a bounded request count and stable order", async () => {
  const pending = new Map<number, (value: unknown) => void>();
  const page = (p: number) => ({
    data: [{ id: `q-${p}` }],
    page: p,
    total_pages: 7,
    total: 7,
    limit: 100,
  });
  vi.mocked(apiClient.get).mockImplementation((_url, params) =>
    params?.page === 1
      ? Promise.resolve(page(1))
      : new Promise((resolve) => pending.set(Number(params?.page), resolve)),
  );
  const result = questionsService.getAllIds({ status: "draft" });
  await vi.waitFor(() => expect(pending.size).toBe(4));
  expect(apiClient.get).toHaveBeenCalledTimes(5);
  for (const p of [5, 3, 4, 2]) pending.get(p)!(page(p));
  await vi.waitFor(() => expect(pending.size).toBe(6));
  pending.get(7)!(page(7));
  pending.get(6)!(page(6));
  expect(await result).toEqual([
    "q-1",
    "q-2",
    "q-3",
    "q-4",
    "q-5",
    "q-6",
    "q-7",
  ]);
  expect(
    vi.mocked(apiClient.get).mock.calls.every(([, p]) => p?.status === "draft"),
  ).toBe(true);
});
