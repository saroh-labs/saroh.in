import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Session replay is the workspace's signed-in shell and nowhere else
 * (DEC-123): never accounts (sign-in, sign-up, passwords), never the admin
 * console, never saroh.in, never a merchant site. The recorder's own rules
 * refuse every app but this one (`replayDecision`, tested in
 * `@saroh/error-tracking`); this pins the other half, in the sources:
 *
 *  - only this app hands the recorder to the tracker at all;
 *  - in this app, only `WorkspaceTracking` starts it, and only `AppShell`
 *    (the signed-in shell) mounts that.
 *
 * Merchant sites are held by `pnpm run check:merchant-site-tracking`.
 */
const appsDir = path.resolve(__dirname, "../../..");

function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
            return [];
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) return [];
        if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
        return [full];
    });
}

function filesWith(app: string, shape: RegExp): string[] {
    const root = path.join(appsDir, app);
    return sources(root)
        .filter((file) => shape.test(readFileSync(file, "utf8")))
        .map((file) => path.relative(root, file));
}

/** Anything that could hand over or start the recorder. */
const RECORDER =
    /posthog-recorder|loadRecorder|startReplay|startSessionRecording|POSTHOG_REPLAY/;

describe("session replay is the workspace shell only", () => {
    it.each([
        ["accounts.saroh.in", []],
        ["admin.saroh.in", []],
        ["saroh.in", []],
        // The merchant's OWN tracker (#889): their project, their site,
        // behind the site's consent banner. Its loader stub names the
        // method; Saroh's recorder is never there.
        ["saroh.app", ["lib/trackers.ts"]],
    ])("%s never names Saroh's recorder", (app, merchantsOwn) => {
        expect(filesWith(app, RECORDER)).toEqual(merchantsOwn);
    });

    it("only this app's tracker is handed the recorder", () => {
        expect(
            filesWith("app.saroh.in", /loadRecorder|posthog-recorder/),
        ).toEqual(["lib/error-tracking-browser.ts"]);
    });

    it("only WorkspaceTracking starts it, and only the signed-in shell mounts that", () => {
        expect(filesWith("app.saroh.in", /\.startReplay\(/)).toEqual([
            "components/shared/workspace-tracking.tsx",
        ]);
        expect(filesWith("app.saroh.in", /<WorkspaceTracking\b/)).toEqual([
            "components/shared/app-shell.tsx",
        ]);
    });

    it("the shell asks for a recording only where it is switched on and shared", () => {
        const shell = readFileSync(
            path.join(appsDir, "app.saroh.in/components/shared/app-shell.tsx"),
            "utf8",
        );
        expect(shell).toContain(
            "sharesUsage={recordingOn && sharesUsageNow(usageSharing)}",
        );
        // Read before the recorder could start, and only when switched on.
        expect(shell).toContain("recordingOn ? usageSharingOrNull() : null");
    });
});
