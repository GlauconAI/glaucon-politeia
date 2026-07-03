import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandShortcuts } from "@/components/layout/CommandShortcuts";

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerState,
}));

describe("command shortcuts", () => {
  it("navigates home with the global G H sequence", () => {
    render(<CommandShortcuts />);

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });

    expect(routerState.push).toHaveBeenCalledWith("/");
  });
});
