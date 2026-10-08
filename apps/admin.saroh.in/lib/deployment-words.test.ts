import { describe, expect, it } from "vitest";

import {
    anyInFlight,
    RUN_STATE,
    shortCommit,
    triggerWords,
} from "./deployment-words";
import type { DeploymentRow, RunState } from "./deployments";

const row = (state: RunState | null): DeploymentRow => ({
    app: "web",
    label: "Marketing site",
    environment: "development",
    worker: "saroh-web-dev",
    latestRun: state
        ? {
              state,
              url: "https://github.example.test/r/1",
              trigger: "push",
              commit: "abcdef1234567",
              startedAt: "2026-10-08T00:00:00Z",
          }
        : null,
    lastDeploy: null,
});

describe("deployment words (#886)", () => {
    it("says every state in words", () => {
        for (const state of Object.keys(RUN_STATE) as RunState[]) {
            expect(RUN_STATE[state].label.length).toBeGreaterThan(0);
        }
        expect(RUN_STATE.failed.variant).toBe("error");
    });

    it("names what started a run", () => {
        expect(triggerWords("workflow_dispatch")).toBe("started by hand");
        expect(triggerWords("push")).toBe("from a merge");
        expect(triggerWords("schedule")).toBe("nightly build");
    });

    it("shortens a commit as GitHub does", () => {
        expect(shortCommit("abcdef1234567")).toBe("abcdef1");
    });

    it("looks again only while a run is on its way", () => {
        expect(anyInFlight([row("succeeded"), row(null)])).toBe(false);
        expect(anyInFlight([row("succeeded"), row("queued")])).toBe(true);
        expect(anyInFlight([row("running")])).toBe(true);
        expect(anyInFlight([row("waiting")])).toBe(true);
    });
});
