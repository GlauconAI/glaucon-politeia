import { describe, expect, it } from "vitest";

import {
  detectSensitivePromptContent,
  validatePromptPayload,
} from "@/lib/prompts/validation";
import {
  findPromptCandidate,
  getOrCreateClientSessionId,
  shouldSkipPromptCapture,
} from "@/lib/prompts/client";

describe("prompt validation", () => {
  it("validates required prompt payload fields", () => {
    expect(validatePromptPayload({ content: "hi" }).ok).toBe(false);
    expect(
      validatePromptPayload({
        content: "write tests",
        clientSessionId: "session",
        sourceUrl: "http://localhost/editor",
        idempotencyKey: "key",
      }).ok,
    ).toBe(true);
  });

  it("flags likely sensitive content", () => {
    const flags = detectSensitivePromptContent("my key is sk-test and token eyJabc");
    expect(flags.has_sensitive).toBe(true);
    expect(flags.sensitive_hits.map((hit) => hit.type)).toContain("openai_key");
  });
});

describe("prompt capture client helpers", () => {
  it("skips auth paths and password forms", () => {
    const form = document.createElement("form");
    const password = document.createElement("input");
    password.type = "password";
    form.append(password);

    expect(shouldSkipPromptCapture("/auth", form)).toBe(true);
    expect(shouldSkipPromptCapture("/editor", form)).toBe(true);
  });

  it("finds the longest prompt-like field in a form", () => {
    const form = document.createElement("form");
    const short = document.createElement("textarea");
    short.value = "hi";
    const long = document.createElement("textarea");
    long.value = "write a detailed implementation plan";
    form.append(short, long);

    expect(findPromptCandidate(form)).toBe("write a detailed implementation plan");
  });

  it("persists one generated client session id", () => {
    const store = new Map<string, string>();
    const storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    } satisfies Storage;

    const first = getOrCreateClientSessionId(storage, () => "generated");
    const second = getOrCreateClientSessionId(storage, () => "other");

    expect(first).toBe("generated");
    expect(second).toBe("generated");
  });
});
