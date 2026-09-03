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
  export interface ApprovalReport {
    periodStart: string;
    periodEnd: string;
    relevantSessions: number;
    escalationRequests: number;
    gatewayExecCalls: number;
    deniedCalls: number;
    manualApprovalCount: null;
    manualApprovalNote: string;
  }

  export function analyzeApprovalSessions(
    sessionPaths: string[],
    options: { repoMarker?: string; since: Date; now?: Date },
  ): ApprovalReport;
  export function formatApprovalReport(report: ApprovalReport): string;
}
