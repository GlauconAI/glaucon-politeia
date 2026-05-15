export type SupabaseOpsStatus = {
  avatarsBucket: boolean;
  promptsTable: boolean;
  promptHourlyStats: boolean;
  archiveOldPrompts: boolean;
};

export type SupabaseOpsCommand =
  | { command: "status" }
  | { command: "apply-missing" }
  | { command: "readiness" }
  | { command: "make-admin"; email: string };

export type LaunchReadinessInput = {
  env: Record<string, string | undefined>;
  status: SupabaseOpsStatus;
  adminCount: number;
};

export type LaunchReadinessCheck = {
  id: string;
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

export const opsMigrations = {
  avatarStorage: "supabase/migrations/20260515000200_avatar_storage.sql",
  prompts: "supabase/migrations/20260515000300_prompts.sql",
  promptAdminRpc: "supabase/migrations/20260515000400_prompt_admin_rpc.sql",
} as const;

export function migrationPlanFromStatus(status: SupabaseOpsStatus) {
  const plan: string[] = [];

  if (!status.avatarsBucket) {
    plan.push(opsMigrations.avatarStorage);
  }

  if (!status.promptsTable) {
    plan.push(opsMigrations.prompts);
  }

  if (!status.promptHourlyStats || !status.archiveOldPrompts) {
    plan.push(opsMigrations.promptAdminRpc);
  }

  return plan;
}

export function parseOpsArgs(args: string[]): SupabaseOpsCommand {
  const command = args[0];

  if (!command || command === "status") {
    return { command: "status" };
  }

  if (command === "apply-missing") {
    return { command: "apply-missing" };
  }

  if (command === "readiness") {
    return { command: "readiness" };
  }

  if (command === "make-admin") {
    const email = readFlag(args, "--email")?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      throw new Error("make-admin requires --email user@example.com");
    }

    return { command: "make-admin", email };
  }

  throw new Error(`Unknown Supabase ops command: ${command}`);
}

export function usernameFromEmailForOps(email: string) {
  const localPart = email.split("@")[0] || "admin";
  const username = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return username || "admin";
}

export function buildLaunchReadinessReport(input: LaunchReadinessInput) {
  const checks: LaunchReadinessCheck[] = [];
  const requiredEnv = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "PROMPTS_RETENTION_SECRET",
    "SUPABASE_DB_URL",
  ];
  const missingEnv = requiredEnv.filter((key) => !input.env[key]?.trim());
  const missingMigrations = migrationPlanFromStatus(input.status);

  checks.push({
    id: "env",
    label: "Required local environment",
    state: missingEnv.length === 0 ? "pass" : "fail",
    detail:
      missingEnv.length === 0
        ? "All required local variables are present."
        : `Missing: ${missingEnv.join(", ")}`,
  });
  checks.push({
    id: "migrations",
    label: "Supabase migrations",
    state: missingMigrations.length === 0 ? "pass" : "fail",
    detail:
      missingMigrations.length === 0
        ? "Remote database has all required launch objects."
        : `Missing migration coverage: ${missingMigrations.join(", ")}`,
  });
  checks.push({
    id: "admin-user",
    label: "Admin user",
    state: input.adminCount > 0 ? "pass" : "warn",
    detail:
      input.adminCount > 0
        ? `${input.adminCount} admin profile(s) found.`
        : "No admin profile found. Run npm run supabase:make-admin -- --email owner@example.com after first login.",
  });

  return {
    ready: checks.every((check) => check.state === "pass"),
    checks,
  };
}

function readFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}
