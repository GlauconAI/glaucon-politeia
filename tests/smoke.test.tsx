import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("home page", () => {
  it("renders the personal knowledge universe surface", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: /^402v$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/notes, sites, fragments, and family archives/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /collections/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /recently placed/i }),
    ).toBeInTheDocument();
  });
});
