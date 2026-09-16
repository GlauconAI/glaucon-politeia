import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectCatalogAuditPanel } from "@/components/observatory/ProjectCatalogAuditPanel";

const baseAudit = {
  schema_version: "1.0.0" as const,
  collected_at: "2026-09-16T21:00:00.000Z",
  status: "drift" as const,
  unregistered_surfaces: [
    "Shared/asgard-archaea-gacha-game",
    "Socrates/nas-map",
  ],
  registered_paths_missing: [],
  mapping_incomplete: [],
  projection_drift: false,
  mirror_drift: false,
  snapshot_drift: false,
  error_code: null,
};

describe("ProjectCatalogAuditPanel", () => {
  it("shows read-only Catalog drift without offering mutation actions", () => {
    render(<ProjectCatalogAuditPanel audit={baseAudit} />);

    expect(
      screen.getByRole("heading", { name: "Project Catalog Audit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("drift")).toBeInTheDocument();
    expect(screen.getByText("Shared/asgard-archaea-gacha-game")).toBeInTheDocument();
    expect(screen.getByText("Socrates/nas-map")).toBeInTheDocument();
    expect(screen.getAllByText(/read-only/u)).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders failed and unavailable audit states explicitly", () => {
    const { rerender } = render(
      <ProjectCatalogAuditPanel
        audit={{
          ...baseAudit,
          status: "failed",
          unregistered_surfaces: [],
          error_code: "AUDIT_READ_FAILED",
        }}
      />,
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/AUDIT_READ_FAILED/u)).toBeInTheDocument();
    expect(screen.queryByText("aligned")).not.toBeInTheDocument();

    rerender(<ProjectCatalogAuditPanel audit={null} />);
    expect(screen.getByText(/not available for this snapshot/u)).toBeInTheDocument();
  });
});
