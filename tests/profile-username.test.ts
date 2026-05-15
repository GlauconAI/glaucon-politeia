import { describe, expect, it } from "vitest";

import {
  createUniqueUsername,
  usernameFromEmail,
} from "@/lib/profiles/username";

describe("profile username helpers", () => {
  it("creates a username candidate from an email prefix", () => {
    expect(usernameFromEmail("Glaucon.Dev+notes@example.com")).toBe(
      "glaucon-dev",
    );
  });

  it("uses a fallback for empty or non-ascii email prefixes", () => {
    expect(usernameFromEmail("你好@example.com")).toBe("user");
  });

  it("limits username candidates to 32 characters", () => {
    expect(usernameFromEmail(`${"a".repeat(80)}@example.com`)).toHaveLength(32);
  });

  it("returns the base username when it is available", () => {
    const username = createUniqueUsername("glaucon@example.com", {
      isTaken: () => false,
      suffix: () => "abcd",
    });

    expect(username).toBe("glaucon");
  });

  it("adds a deterministic suffix when the base username is taken", () => {
    const username = createUniqueUsername("glaucon@example.com", {
      isTaken: (candidate) => candidate === "glaucon",
      suffix: () => "7f9a",
    });

    expect(username).toBe("glaucon-7f9a");
  });

  it("keeps suffixed usernames inside the max length", () => {
    const username = createUniqueUsername(`${"a".repeat(80)}@example.com`, {
      isTaken: () => true,
      suffix: () => "zzzz",
      maxLength: 12,
    });

    expect(username).toBe("aaaaaaa-zzzz");
    expect(username).toHaveLength(12);
  });
});
