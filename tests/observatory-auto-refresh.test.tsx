import { render, act } from "@testing-library/react";
import { it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { SnapshotAutoRefresh } from "@/components/observatory/SnapshotAutoRefresh";
it("refreshes visible pages and stops when unmounted", () => {
  vi.useFakeTimers();
  const view = render(<SnapshotAutoRefresh />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  view.unmount();
  act(() => vi.advanceTimersByTime(60_000));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
