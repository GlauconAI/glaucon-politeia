import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/components/layout/AppShell";

describe("app shell", () => {
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
    expect(within(primaryNav).getByRole("link", { name: "Learn" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Sites" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Fragments" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Family" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Products" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Archive" })).toBeInTheDocument();
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
  });
});
