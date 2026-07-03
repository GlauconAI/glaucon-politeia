import { describe, expect, it } from "vitest";

import {
  collectionForPath,
  collectionQueryForPath,
  collectionRoutes,
} from "@/lib/posts/collections";

describe("post collections", () => {
  it("maps collection routes to first-class pages", () => {
    expect(collectionRoutes.map((route) => route.href)).toEqual([
      "/learn",
      "/sites",
      "/fragments",
      "/family",
      "/products",
      "/archive",
    ]);
  });

  it("builds focused queries for sites and family collections", () => {
    expect(collectionForPath("sites")?.label).toBe("Sites");
    expect(collectionQueryForPath("sites")).toEqual({
      contentFormat: "html",
      tagSlugs: [],
    });

    expect(collectionForPath("family")?.label).toBe("Family");
    expect(collectionQueryForPath("family")).toEqual({
      contentFormat: undefined,
      tagSlugs: ["family"],
    });
  });
});
