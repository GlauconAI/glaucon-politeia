import { describe, expect, it } from "vitest";

import { metadata } from "@/app/work-tracker/layout";

describe("Concerto brand", () => {
  it("publishes the canonical browser metadata", () => {
    expect(metadata.title).toBe("Concerto — Work Tracker");
    expect(metadata.description).toBe("Where work and minds move in concert.");
  });
});
