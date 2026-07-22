import { describe, expect, it } from "vitest";

import {
  createObservatoryRefreshState,
  evaluateObservatoryRefreshStaleness,
  transitionObservatoryRefreshState,
} from "@/lib/observatory/refresh-state";

const startedAt = "2026-07-22T20:00:00.000Z";

describe("Observatory refresh state", () => {
  it("notifies only when the third consecutive failure is reached", () => {
    let state = createObservatoryRefreshState(startedAt);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = transitionObservatoryRefreshState(state, {
        type: "failure",
        at: `2026-07-22T20:0${attempt}:00.000Z`,
      });
      state = result.state;
      expect(result.notification).toBeNull();
    }

    const third = transitionObservatoryRefreshState(state, {
      type: "failure",
      at: "2026-07-22T20:03:00.000Z",
    });
    expect(third.notification).toBe("failure");
    expect(third.state.consecutive_failures).toBe(3);

    const fourth = transitionObservatoryRefreshState(third.state, {
      type: "failure",
      at: "2026-07-22T20:04:00.000Z",
    });
    expect(fourth.notification).toBeNull();
  });

  it("emits one recovery notice and resets failure and stale state", () => {
    let state = createObservatoryRefreshState(startedAt);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      state = transitionObservatoryRefreshState(state, {
        type: "failure",
        at: `2026-07-22T20:0${attempt}:00.000Z`,
      }).state;
    }

    const recovered = transitionObservatoryRefreshState(state, {
      type: "success",
      at: "2026-07-22T20:05:00.000Z",
    });
    expect(recovered.notification).toBe("recovery");
    expect(recovered.state.consecutive_failures).toBe(0);
    expect(recovered.state.last_success_at).toBe("2026-07-22T20:05:00.000Z");
    expect(recovered.state.stale_notified_at).toBeNull();

    const healthy = transitionObservatoryRefreshState(recovered.state, {
      type: "success",
      at: "2026-07-22T20:20:00.000Z",
    });
    expect(healthy.notification).toBeNull();
  });

  it("escalates once after 45 minutes without a successful refresh", () => {
    const state = createObservatoryRefreshState(startedAt);
    expect(
      evaluateObservatoryRefreshStaleness(
        state,
        "2026-07-22T20:44:59.999Z",
      ).notification,
    ).toBeNull();

    const stale = evaluateObservatoryRefreshStaleness(
      state,
      "2026-07-22T20:45:00.000Z",
    );
    expect(stale.notification).toBe("stale");
    expect(stale.state.stale_notified_at).toBe("2026-07-22T20:45:00.000Z");
    expect(
      evaluateObservatoryRefreshStaleness(
        stale.state,
        "2026-07-22T21:45:00.000Z",
      ).notification,
    ).toBeNull();
  });

  it("uses the most recent success as the stale reference point", () => {
    const healthy = transitionObservatoryRefreshState(
      createObservatoryRefreshState(startedAt),
      { type: "success", at: "2026-07-22T20:30:00.000Z" },
    ).state;

    expect(
      evaluateObservatoryRefreshStaleness(
        healthy,
        "2026-07-22T21:14:59.999Z",
      ).notification,
    ).toBeNull();
    expect(
      evaluateObservatoryRefreshStaleness(
        healthy,
        "2026-07-22T21:15:00.000Z",
      ).notification,
    ).toBe("stale");
  });
});
