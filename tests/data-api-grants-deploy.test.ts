import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateGrantMigration } from "../scripts/observatory/deploy-data-api-grants";

const source = readFileSync("supabase/migrations/20261023000100_explicit_data_api_grants.sql", "utf8");

describe("bounded Data API grant deployment", () => {
  it("accepts only the reviewed seven grants", () => {
    expect(() => validateGrantMigration(source)).not.toThrow();
    const executable = validateGrantMigration(source);
    expect(executable).not.toContain("--");
    expect(executable.split(";").filter((value) => value.trim())).toHaveLength(7);
  });
  it.each([
    "grant select on all tables in schema public to anon;",
    "alter table public.prompts disable row level security;",
    "grant select on public.observatory_work_items to service_role;",
    "grant select on public.prompts to public;",
    "commit;",
    "\n-- hidden transaction break\rCOMMIT;\n",
    "\n-- hidden grant\rGRANT SELECT ON public.prompts TO PUBLIC;\n",
  ])("refuses additional SQL: %s", (extra) => {
    expect(() => validateGrantMigration(source + extra)).toThrow();
  });
  it("refuses missing grants", () => {
    expect(() => validateGrantMigration(source.replace(/grant select, insert on table public.prompts to anon;/, ""))).toThrow();
  });
});
