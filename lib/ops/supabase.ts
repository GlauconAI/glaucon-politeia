export type SupabaseOpsStatus = {
  avatarsBucket: boolean;
  promptsTable: boolean;
  promptHourlyStats: boolean;
  archiveOldPrompts: boolean;
};

export type SupabaseOpsCommand =
  | { command: "status" }
  | { command: "apply-missing" }
  | { command: "make-admin"; email: string };

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

function readFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}
