import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/AppShell";

const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

describe("app shell", () => {
  beforeEach(() => {
    routerPushMock.mockClear();
  });

  it("renders global navigation landmarks", () => {
    render(
      <AppShell userEmail={null}>
        <p>Content area</p>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    const primaryNav = screen.getByRole("navigation", { name: /primary/i });
    expect(primaryNav).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Content area");
    expect(screen.getByRole("link", { name: /402v home/i })).toBeInTheDocument();
    expect(screen.getByText("~/publishing-system")).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
    expect(within(primaryNav).getByRole("link", { name: "Sites" })).toHaveAttribute("href", "/sites");
    expect(within(primaryNav).getByRole("link", { name: "Fragments" })).toHaveAttribute("href", "/fragments");
    expect(within(primaryNav).getByRole("link", { name: "Family" })).toHaveAttribute("href", "/family");
    expect(within(primaryNav).getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products");
    expect(within(primaryNav).getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/archive");
  });

  it("shows login state when no user is present", () => {
    render(
      <AppShell userEmail={null}>
        <p>Content area</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /登录/i })).toHaveAttribute(
      "href",
      "/auth",
    );
    expect(
      screen.queryByRole("link", { name: /publish/i }),
    ).not.toBeInTheDocument();
  });

  it("shows user email and profile link when logged in", () => {
    render(
      <AppShell userEmail="reader@example.com" canPublish>
        <p>Content area</p>
      </AppShell>,
    );

    expect(screen.getByText("reader@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /个人资料/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /publish/i })).toHaveAttribute(
      "href",
      "/editor",
    );
    expect(
      screen.getByRole("link", { name: /^dashboard$/i }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("does not show publishing access to logged-in non-admin users", () => {
    render(
      <AppShell userEmail="reader@example.com" canPublish={false}>
        <p>Content area</p>
      </AppShell>,
    );

    expect(screen.getByText("reader@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^dashboard$/i }),
    ).not.toBeInTheDocument();
  });

  it("supports non-conflicting global command shortcuts", () => {
    render(
      <AppShell userEmail={null}>
        <p>Content area</p>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(routerPushMock).toHaveBeenCalledWith("/search");

    routerPushMock.mockClear();

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "s" });
    expect(routerPushMock).toHaveBeenCalledWith("/sites");

    routerPushMock.mockClear();
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "l" });
    expect(routerPushMock).toHaveBeenCalledWith("/learn");
  });

  it("does not claim browser-reserved Command+H or Command+L", () => {
    render(
      <AppShell userEmail={null}>
        <p>Content area</p>
      </AppShell>,
    );

    fireEvent.keyDown(window, { key: "h", metaKey: true });
    fireEvent.keyDown(window, { key: "l", metaKey: true });

    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("does not render the long header search field", () => {
    render(
      <AppShell userEmail={null}>
        <p>Content area</p>
      </AppShell>,
    );

    expect(
      screen.queryByRole("searchbox", { name: /search posts/i }),
    ).not.toBeInTheDocument();
  });
});
