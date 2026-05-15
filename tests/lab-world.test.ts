import { describe, expect, it } from "vitest";

import { labWorldCards, nextCardId } from "@/lib/lab/world";

describe("lab world model", () => {
  it("keeps cards addressable and positioned", () => {
    expect(labWorldCards.length).toBeGreaterThanOrEqual(5);
    expect(new Set(labWorldCards.map((card) => card.id)).size).toBe(labWorldCards.length);
    expect(labWorldCards.every((card) => card.position.length === 3)).toBe(true);
  });

  it("cycles active card ids in both directions", () => {
    expect(nextCardId(labWorldCards[0].id, 1)).toBe(labWorldCards[1].id);
    expect(nextCardId(labWorldCards[0].id, -1)).toBe(labWorldCards.at(-1)?.id);
  });
});
