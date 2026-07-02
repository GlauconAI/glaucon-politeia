import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("auth public surface", () => {
  it("does not expose a registration mode or OAuth signup path in the login form", () => {
    const form = readProjectFile("components/auth/AuthForm.tsx");
    const page = readProjectFile("app/auth/page.tsx");

    expect(form).not.toContain("registerAction");
    expect(form).not.toContain("mode === \"login\"");
    expect(form).not.toContain("auth-switch");
    expect(form).not.toContain("oauthAction");
    expect(page).not.toContain("mode === \"register\"");
  });

  it("keeps direct server-side registration and OAuth starts closed", () => {
    const actions = readProjectFile("app/auth/actions.ts");

    expect(actions).not.toContain("signUp");
    expect(actions).not.toContain("signInWithOAuth");
    expect(actions).toContain("Registration is closed");
    expect(actions).toContain("OAuth login is disabled");
  });
});
