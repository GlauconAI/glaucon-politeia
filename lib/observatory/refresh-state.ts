export type ObservatoryRefreshNotification = "failure" | "stale" | "recovery";

export interface ObservatoryRefreshState {
  version: 1;
  monitoring_started_at: string;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_notified_at: string | null;
  stale_notified_at: string | null;
}

export type ObservatoryRefreshEvent = {
  type: "success" | "failure";
  at: string;
};

export interface ObservatoryRefreshTransition {
  state: ObservatoryRefreshState;
  notification: ObservatoryRefreshNotification | null;
}

const FAILURE_NOTIFICATION_THRESHOLD = 3;
export const OBSERVATORY_STALE_THRESHOLD_MS = 45 * 60 * 1000;
export const OBSERVATORY_REFRESH_STEP_TIMEOUT_MS = 10 * 60 * 1000;

const SAFE_REFRESH_STEP_FAILURE_CODES = [
  "REGISTRY_READ_FAILED",
  "REGISTRY_INVALID",
  "COMMAND_FAILED",
  "COMMAND_TIMEOUT",
  "CLI_JSON_MALFORMED",
  "CLI_SCHEMA_INVALID",
  "SNAPSHOT_INVALID",
  "RESOURCE_LIMIT_EXCEEDED",
  "FILE_IDENTITY_FAILED",
  "SOURCE_WRITE_FORBIDDEN",
  "ATOMIC_WRITE_FAILED",
  "DIRECTORY_SYNC_FAILED",
  "GOVERNANCE_READ_FAILED",
  "GOVERNANCE_SOURCE_ESCAPE",
  "GOVERNANCE_INVALID",
  "OBSERVATORY_COLLECT_FAILED",
  "INVALID_SNAPSHOT",
  "DIGEST_MISMATCH",
  "CONFIG_MISSING",
  "PUBLISH_FAILED",
  "DUPLICATE_CONFIRM_FAILED",
] as const;

export function sanitizeObservatoryRefreshStepFailure(input: string): string {
  if (/COMMAND_TIMEOUT:\s+OpenClaw agents\b/u.test(input)) {
    return "COMMAND_TIMEOUT_AGENTS";
  }
  if (/COMMAND_TIMEOUT:\s+OpenClaw status\b/u.test(input)) {
    return "COMMAND_TIMEOUT_STATUS";
  }
  for (const code of SAFE_REFRESH_STEP_FAILURE_CODES) {
    if (new RegExp(`(?:^|[^A-Z_])${code}(?:[^A-Z_]|$)`, "u").test(input)) {
      return code;
    }
  }
  return "STEP_FAILED";
}

function requireIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new TypeError("Refresh state timestamps must be canonical ISO timestamps.");
  }
  return value;
}

export function createObservatoryRefreshState(
  monitoringStartedAt: string,
): ObservatoryRefreshState {
  return {
    version: 1,
    monitoring_started_at: requireIsoTimestamp(monitoringStartedAt),
    consecutive_failures: 0,
    last_success_at: null,
    last_failure_at: null,
    failure_notified_at: null,
    stale_notified_at: null,
  };
}

export function transitionObservatoryRefreshState(
  state: ObservatoryRefreshState,
  event: ObservatoryRefreshEvent,
): ObservatoryRefreshTransition {
  const at = requireIsoTimestamp(event.at);
  if (event.type === "failure") {
    const consecutiveFailures = state.consecutive_failures + 1;
    const shouldNotify =
      consecutiveFailures === FAILURE_NOTIFICATION_THRESHOLD &&
      state.failure_notified_at === null;
    return {
      state: {
        ...state,
        consecutive_failures: consecutiveFailures,
        last_failure_at: at,
        failure_notified_at: shouldNotify ? at : state.failure_notified_at,
      },
      notification: shouldNotify ? "failure" : null,
    };
  }

  const recovering =
    state.consecutive_failures > 0 ||
    state.failure_notified_at !== null ||
    state.stale_notified_at !== null;
  return {
    state: {
      ...state,
      consecutive_failures: 0,
      last_success_at: at,
      failure_notified_at: null,
      stale_notified_at: null,
    },
    notification: recovering ? "recovery" : null,
  };
}

export function evaluateObservatoryRefreshStaleness(
  state: ObservatoryRefreshState,
  now: string,
  thresholdMs = OBSERVATORY_STALE_THRESHOLD_MS,
): ObservatoryRefreshTransition {
  const checkedAt = requireIsoTimestamp(now);
  if (!Number.isSafeInteger(thresholdMs) || thresholdMs < 1) {
    throw new TypeError("The stale threshold must be a positive integer.");
  }
  if (state.stale_notified_at !== null) {
    return { state, notification: null };
  }
  const reference = state.last_success_at ?? state.monitoring_started_at;
  if (Date.parse(checkedAt) - Date.parse(reference) < thresholdMs) {
    return { state, notification: null };
  }
  return {
    state: { ...state, stale_notified_at: checkedAt },
    notification: "stale",
  };
}
