import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EarthRevolutionPage from "@/app/earth-revolution/page";
import FragmentsPage from "@/app/fragments/page";

vi.mock("@/app/collection-page", () => ({
  CollectionPage: ({ slug }: { slug: string }) => (
    <section aria-label={`${slug} collection`}>{slug}</section>
  ),
}));

describe("Earth Revolution surface", () => {
  it("renders a standalone novel project page", () => {
    render(<EarthRevolutionPage />);

    expect(screen.getByRole("heading", { name: "地球革命" })).toBeInTheDocument();
    expect(screen.getByText("Novel project")).toBeInTheDocument();
    expect(screen.getByText("泽鲁 / Lurra 文明")).toBeInTheDocument();
    expect(screen.getByText("信息殖民")).toBeInTheDocument();
    expect(screen.getByText("第一部：月球上的谋杀案")).toBeInTheDocument();
  });

  it("places Earth Revolution above the fragments collection page", () => {
    render(<FragmentsPage />);

    const feature = screen.getByRole("region", { name: "Earth Revolution feature" });
    const collection = screen.getByRole("region", { name: "fragments collection" });

    expect(within(feature).getByRole("heading", { name: "地球革命" })).toBeInTheDocument();
    expect(feature.compareDocumentPosition(collection)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
