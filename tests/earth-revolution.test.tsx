import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EarthRevolutionPage from "@/app/earth-revolution/page";
import Home from "@/app/page";

describe("Earth Revolution surface", () => {
  it("places Earth Revolution as a first-page feature on the home page", async () => {
    render(await Home());

    const feature = screen.getByRole("region", { name: "Earth Revolution feature" });

    expect(within(feature).getByRole("heading", { name: "地球革命" })).toBeInTheDocument();
    expect(within(feature).getByText("半殖民地半封建星球")).toBeInTheDocument();
    expect(within(feature).getByRole("link", { name: "Open Earth Revolution" })).toHaveAttribute(
      "href",
      "/earth-revolution",
    );
  });

  it("renders a standalone novel project page", () => {
    render(<EarthRevolutionPage />);

    expect(screen.getByRole("heading", { name: "地球革命" })).toBeInTheDocument();
    expect(screen.getByText("Novel project")).toBeInTheDocument();
    expect(screen.getByText("泽鲁 / Lurra 文明")).toBeInTheDocument();
    expect(screen.getByText("信息殖民")).toBeInTheDocument();
    expect(screen.getByText("第一部：月球上的谋杀案")).toBeInTheDocument();
  });
});
