import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Content area");
    expect(
      screen.getByRole("complementary", { name: /site information/i }),
    ).toBeInTheDocument();
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
  });

  it("shows user email and profile link when logged in", () => {
    render(
      <AppShell userEmail="reader@example.com">
        <p>Content area</p>
      </AppShell>,
    );

    expect(screen.getByText("reader@example.com")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /个人资料/i })).toHaveLength(2);
  });
});
