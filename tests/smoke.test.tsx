import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("home page", () => {
  it("renders the calm personal publishing surface", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: /^402v$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /spaces/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /latest publishing/i }),
    ).toBeInTheDocument();
  });
});
