export type DueReminderDependencies = {
  cwd?: string;
  now?: Date;
  baseUrl?: string;
  maxItems?: number;
  maxBytes?: number;
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
  connect?: (databaseUrl: string) => unknown;
  stdout?: { write(chunk: string): unknown };
  stderr?: { write(chunk: string): unknown };
};

export function runDueReminder(
  dependencies?: DueReminderDependencies,
): Promise<0 | 1>;
