#!/usr/bin/env node

import fs from "node:fs";
import postgres from "postgres";

const migrations = {
  avatarStorage: "supabase/migrations/20260515000200_avatar_storage.sql",
  prompts: "supabase/migrations/20260515000300_prompts.sql",
  promptAdminRpc: "supabase/migrations/20260515000400_prompt_admin_rpc.sql",
};

const command = parseArgs(process.argv.slice(2));
const env = readEnv(".env.local");

if (!env.SUPABASE_DB_URL) {
  fail("SUPABASE_DB_URL is missing from .env.local");
}

const sql = postgres(env.SUPABASE_DB_URL, { ssl: "require", max: 1 });

try {
  if (command.command === "status") {
    const status = await readStatus(sql);
    printStatus(status);
  }

  if (command.command === "apply-missing") {
    const status = await readStatus(sql);
    const plan = migrationPlanFromStatus(status);

    if (plan.length === 0) {
      console.log("No missing Supabase migrations detected.");
    }

    for (const file of plan) {
      process.stdout.write(`Applying ${file} ... `);
      await sql.unsafe(fs.readFileSync(file, "utf8"));
      console.log("ok");
    }

    printStatus(await readStatus(sql));
  }

  if (command.command === "make-admin") {
    await makeAdmin(sql, command.email);
  }
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

function readEnv(path) {
  const values = {};

  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function parseArgs(args) {
  const name = args[0] || "status";

  if (name === "status") return { command: "status" };
  if (name === "apply-missing") return { command: "apply-missing" };

  if (name === "make-admin") {
    const email = readFlag(args, "--email")?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      fail("make-admin requires --email user@example.com");
    }
    return { command: "make-admin", email };
  }

  fail(`Unknown command: ${name}`);
}

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function migrationPlanFromStatus(status) {
  const plan = [];
  if (!status.avatarsBucket) plan.push(migrations.avatarStorage);
  if (!status.promptsTable) plan.push(migrations.prompts);
  if (!status.promptHourlyStats || !status.archiveOldPrompts) {
    plan.push(migrations.promptAdminRpc);
  }
  return plan;
}

async function readStatus(sql) {
  const rows = await sql`
    select
      to_regclass('public.profiles') is not null as profiles_table,
      to_regclass('public.prompts') is not null as prompts_table,
      exists(select 1 from storage.buckets where id = 'avatars' and public = true) as avatars_bucket,
      exists(
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'prompt_hourly_stats'
      ) as prompt_hourly_stats,
      exists(
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'archive_old_prompts'
      ) as archive_old_prompts
  `;
  const row = rows[0];

  return {
    profilesTable: row.profiles_table,
    promptsTable: row.prompts_table,
    avatarsBucket: row.avatars_bucket,
    promptHourlyStats: row.prompt_hourly_stats,
    archiveOldPrompts: row.archive_old_prompts,
  };
}

function printStatus(status) {
  console.log({
    profilesTable: status.profilesTable,
    promptsTable: status.promptsTable,
    avatarsBucket: status.avatarsBucket,
    promptHourlyStats: status.promptHourlyStats,
    archiveOldPrompts: status.archiveOldPrompts,
    missingMigrations: migrationPlanFromStatus(status),
  });
}

async function makeAdmin(sql, email) {
  const users = await sql`
    select id, email
    from auth.users
    where lower(email) = ${email}
    limit 1
  `;

  if (users.length === 0) {
    fail(`No auth user found for ${email}. Log in once first, then rerun this command.`);
  }

  const user = users[0];
  const username = usernameFromEmail(user.email);
  await sql`
    insert into public.profiles (user_id, username, display_name, is_admin)
    values (${user.id}, ${username}, ${user.email}, true)
    on conflict (user_id) do update
    set is_admin = true,
        updated_at = now()
  `;

  console.log(`Admin enabled for ${email}.`);
}

function usernameFromEmail(email) {
  return (
    email
      .split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "admin"
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
