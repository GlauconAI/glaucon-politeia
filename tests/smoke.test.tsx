import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("home page", () => {
  it("renders the project baseline heading", async () => {
    render(await Home());

    expect(
      screen.getByRole("heading", { name: /glaucon politeia/i }),
    ).toBeInTheDocument();
  });
});
