import { describe, expect, it } from "vitest";

import {
  getProfilePostVisibilityFilter,
  getPublicAvatarPath,
  isSupportedAvatarFile,
} from "@/lib/profiles/domain";

describe("profile domain helpers", () => {
  it("shows all posts to owners and only published posts to visitors", () => {
    expect(getProfilePostVisibilityFilter({ isOwner: true })).toEqual({
      includeDrafts: true,
    });
    expect(getProfilePostVisibilityFilter({ isOwner: false })).toEqual({
      includeDrafts: false,
      status: "published",
    });
  });

  it("creates owner-scoped avatar storage paths", () => {
    const path = getPublicAvatarPath({
      userId: "8b267f83-b3d2-4d70-96ec-7f29c6ac7111",
      fileName: "Avatar.PNG",
      randomId: () => "asset-id",
    });

    expect(path).toBe("8b267f83-b3d2-4d70-96ec-7f29c6ac7111/asset-id.png");
  });

  it("rejects unsupported avatar file types", () => {
    expect(isSupportedAvatarFile("image/png")).toBe(true);
    expect(isSupportedAvatarFile("image/jpeg")).toBe(true);
    expect(isSupportedAvatarFile("image/webp")).toBe(true);
    expect(isSupportedAvatarFile("image/svg+xml")).toBe(false);
  });
});
