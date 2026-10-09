import { describe, expect, it } from "vitest";

import {
    anyInFlight,
    ownEnvironmentPanel,
    RUN_STATE,
    shortCommit,
    triggerWords,
} from "./deployment-words";
import type { DeploymentRow, DeploymentsView, RunState } from "./deployments";

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

describe("ownEnvironmentPanel (DEC-107)", () => {
    const view = (
        environment: DeploymentsView["environment"],
    ): DeploymentsView => ({
        configured: true,
        environment,
        workflowUrl: "https://github.example.test/w",
        source: "github",
        readError: null,
        rows: [
            row("succeeded"),
            { ...row(null), environment: "production", worker: "saroh-web" },
        ],
    });

    it("shows the dev console one panel, for development only", () => {
        const panel = ownEnvironmentPanel(view("development"));
        expect(panel?.title).toBe("Development");
        expect(panel?.description).toContain("Built from development.");
        expect(panel?.rows.map((r) => r.environment)).toEqual(["development"]);
        expect(panel?.otherNote).toBe(
            "This console deploys development only. Production is deployed from its own console, admin.saroh.in.",
        );
    });

    it("shows the production console one panel, for production only", () => {
        const panel = ownEnvironmentPanel(view("production"));
        expect(panel?.title).toBe("Production");
        expect(panel?.rows.map((r) => r.worker)).toEqual(["saroh-web"]);
        expect(panel?.otherNote).toContain("admin.saroh.io");
    });

    it("shows no panel when the API names no environment", () => {
        expect(ownEnvironmentPanel(view(null))).toBeNull();
    });
});
