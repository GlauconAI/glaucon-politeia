import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("home page", () => {
  it("renders the publishing command center surface", async () => {
    render(await Home());

    expect(
      screen.getByRole("heading", { name: /402v ~\/publishing-system/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/open notes, sites, fragments, and family archives/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search 402v/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /mounted collections/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /recent outputs/i }),
    ).toBeInTheDocument();
  });
});
