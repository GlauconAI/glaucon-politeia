declare module "@/scripts/release/work-tracker-verify.mjs" {
  export interface VerificationStep {
    id: string;
    command: string;
    args: string[];
    timeoutMs: number;
  }

  export interface VerificationStepResult {
    exitCode: number;
    durationMs: number;
    signal?: NodeJS.Signals | null;
    timedOut?: boolean;
    error?: string;
  }

  export function buildVerificationSteps(): VerificationStep[];
  export function cleanGeneratedNextTypes(
    root: string,
    remover?: (path: string, options: { recursive: true; force: true }) => void,
  ): void;
  export function runVerificationSteps(
    steps: VerificationStep[],
    runner?: (step: VerificationStep) => Promise<VerificationStepResult>,
  ): Promise<{
    ok: boolean;
    failedStep: string | null;
    results: Array<VerificationStepResult & { id: string }>;
  }>;
}

declare module "@/scripts/release/work-tracker-smoke.mjs" {
  export const PRODUCTION_ORIGIN: "https://402v.com";
  export const SMOKE_PATHS: readonly ["/", "/work-tracker"];
  export function validateSmokeResponse(input: {
    requestedPath: string;
    finalUrl: string;
    status: number;
    contentType: string;
  }): void;
}

declare module "@/scripts/release/work-tracker-approval-report.mjs" {
  export interface OperatorApprovalRow {
    status: string;
    decision: string | null;
    terminal_reason: string | null;
  }

  export interface OperatorApprovalSummary {
    status: "available";
    requests: number;
    humanDecisions: number;
    allowedOnce: number;
    allowedAlways: number;
    humanDenied: number;
    expired: number;
    systemCancelled: number;
    pending: number;
  }

  export interface WorkTrackerRollout {
    periodStart: string;
    periodEnd: string;
    relevantSessions: number;
    escalationRequests: number;
    gatewayExecCalls: number;
    deniedCalls: number;
  }

  export interface ApprovalReport {
    workTracker: WorkTrackerRollout & {
      manualApprovalCount: null;
      manualApprovalObservable: false;
    };
    operatorApprovals:
      | (OperatorApprovalSummary & {
          scope: "plato-agent-wide";
          attributionNote: string;
        })
      | { status: "unavailable"; scope: "plato-agent-wide"; reason: string };
    observability: {
      autoReviewApprovals: "unavailable";
      humanPromptsDisplayed: "unavailable";
      timeoutRetries: "unavailable";
      note?: string;
    };
  }

  export function analyzeApprovalSessions(
    sessionPaths: string[],
    options: { repoMarker?: string; since: Date; now?: Date },
  ): WorkTrackerRollout;
  export function buildApprovalReport(
    workTrackerRollout: WorkTrackerRollout,
    rows: OperatorApprovalRow[],
  ): ApprovalReport;
  export function formatApprovalReport(report: WorkTrackerRollout | ApprovalReport): string;
  export function summarizeOperatorApprovals(
    rows: OperatorApprovalRow[],
  ): OperatorApprovalSummary;
  export function queryOperatorApprovals(
    databasePath: string,
    options: { since: Date; now?: Date },
  ): OperatorApprovalRow[];
}

declare module "@/scripts/release/work-tracker-release-prepare.mjs" {
  export const EXPECTED_GIT_COMMON_DIR: string;
  export const EXPECTED_REMOTE_URL: string;
  export const GITHUB_REPOSITORY: "GlauconAI/glaucon-politeia";
  export const ALLOWED_BRANCH_PATTERN: RegExp;
  export const RELEASE_BASELINE_REF: string;
  export const GIT_HARDENING_ARGS: string[];

  export interface ReleaseContext {
    argv: string[];
    gitCommonDir: string;
    remoteUrl: string;
    pushRemoteUrl: string;
    branch: string;
    porcelain: string;
    originMainIsAncestor: boolean;
    behind: number;
    ahead: number;
  }

  export function validateReleaseContext(
    context: ReleaseContext,
  ): { branch: string; ahead: number };
  export function buildPushArgs(branch: string): string[];
  export function safeEnvironmentForRelease(): Record<string, string>;
  export function validateLocalGitConfig(configNames: string): void;
  export function validatePullRequest(
    pullRequest: {
      url: string;
      state: string;
      baseRefName: string;
      headRefName: string;
      isCrossRepository: boolean;
    },
    branch: string,
  ): string;
  export function runReleasePrepare(options?: {
    cwd?: string;
    argv?: string[];
    runner?: (
      command: string,
      args: string[],
      options?: { cwd?: string; allowFailure?: boolean; timeoutMs?: number },
    ) => { exitCode: number; stdout: string; stderr: string };
    canonicalize?: (path: string) => string;
  }): {
    ok: true;
    branch: string;
    ahead: number;
    created: boolean;
    pullRequestUrl: string;
  };
}

declare module "@/scripts/release/work-tracker-wait-for-production.mjs" {
  export const GITHUB_REPOSITORY: "GlauconAI/glaucon-politeia";
  export const DEPLOYMENT_ENVIRONMENT: "Production";
  export function buildDeploymentsUrl(sha: string): string;
  export function waitForProductionDeployment(options: {
    sha: string;
    token: string;
    fetchImpl?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }): Promise<{ ok: true; deploymentId: number; state: "success"; sha: string }>;
}
