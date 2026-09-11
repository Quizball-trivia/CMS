import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { QueryProvider } from "../query-provider";
import { useQuestions } from "@/hooks/use-questions";
import { questionsService } from "@/services";
vi.mock("@/services", () => ({ questionsService: { list: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("reuses a fresh page on navigation and still refreshes after invalidation", async () => {
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce("Before")
    .mockResolvedValue("After");
  function Page() {
    const q = useQuery({ queryKey: ["page"], queryFn: fetchPage });
    const client = useQueryClient();
    return (
      <>
        <span>{q.data}</span>
        <button
          onClick={() => void client.invalidateQueries({ queryKey: ["page"] })}
        >
          Refresh
        </button>
      </>
    );
  }
  const app = (show: boolean) => (
    <QueryProvider>{show && <Page />}</QueryProvider>
  );
  const { rerender } = render(app(true));
  await screen.findByText("Before");
  rerender(app(false));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  rerender(app(true));
  await screen.findByText("Before");
  expect(fetchPage).toHaveBeenCalledTimes(1);
  screen.getByText("Refresh").click();
  await screen.findByText("After");
  expect(fetchPage).toHaveBeenCalledTimes(2);
});
it("cancels an obsolete question search when the filters change", async () => {
  const signals: AbortSignal[] = [];
  vi.mocked(questionsService.list).mockImplementation((_params, signal) => {
    if (signal) signals.push(signal);
    return new Promise(() => {});
  });
  function Page({ search }: { search: string }) {
    useQuestions({ search });
    return null;
  }
  const { rerender } = render(
    <QueryProvider>
      <Page search="old" />
    </QueryProvider>,
  );
  await waitFor(() => expect(questionsService.list).toHaveBeenCalledTimes(1));
  rerender(
    <QueryProvider>
      <Page search="new" />
    </QueryProvider>,
  );
  await waitFor(() => expect(questionsService.list).toHaveBeenCalledTimes(2));
  expect(signals[0]?.aborted).toBe(true);
  expect(signals[1]?.aborted).toBe(false);
});
