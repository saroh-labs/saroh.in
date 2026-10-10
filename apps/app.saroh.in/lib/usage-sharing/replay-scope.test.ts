import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Session replay is the signed-in workspace and saroh.in, and nowhere else
 * (DEC-125, 10 Oct): never accounts (sign-in, sign-up, passwords), never
 * the admin console, never a merchant site. The recorder's own rules refuse
 * every other app (`replayDecision`, `siteReplayDecision`, tested in
 * `@saroh/error-tracking`); this pins the other half, in the sources:
 *
 *  - only this app and saroh.in hand the recorder to the tracker at all,
 *    each in one file;
 *  - in this app, only `WorkspaceTracking` starts it; only `UsageRecording`
 *    mounts that, and it mounts the notice with it; only the signed-in
 *    shell and the goal picker after setup draw `UsageRecording`;
 *  - on saroh.in, only `SiteReplay` starts it, behind the cookie notice.
 *
 * `pnpm run check:merchant-site-tracking` holds the same line for every
 * app in prepush and CI.
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
    /posthog-recorder|loadRecorder|startReplay|startSiteReplay|startSessionRecording|POSTHOG_REPLAY/;

const read = (file: string) => readFileSync(path.join(appsDir, file), "utf8");

describe("session replay is the workspace and saroh.in only", () => {
    it.each([
        ["accounts.saroh.in", []],
        ["admin.saroh.in", []],
        // The merchant's OWN tracker (#889): their project, their site,
        // behind the site's consent banner. Its loader stub names the
        // method; Saroh's recorder is never there.
        ["saroh.app", ["lib/trackers.ts"]],
    ])("%s never names Saroh's recorder", (app, merchantsOwn) => {
        expect(filesWith(app, RECORDER)).toEqual(merchantsOwn);
    });

    it("no app but these two exists that names it", () => {
        const apps = readdirSync(appsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
        const naming = apps.filter(
            (app) =>
                filesWith(app, RECORDER).filter(
                    (file) =>
                        !(app === "saroh.app" && file === "lib/trackers.ts"),
                ).length > 0,
        );
        expect(naming.sort()).toEqual(["app.saroh.in", "saroh.in"]);
    });

    it.each(["app.saroh.in", "saroh.in"])(
        "only %s's tracker is handed the recorder",
        (app) => {
            expect(filesWith(app, /loadRecorder|posthog-recorder/)).toEqual([
                "lib/error-tracking-browser.ts",
            ]);
        },
    );

    it("only WorkspaceTracking starts it, behind the notice, in the shell and the goal picker", () => {
        expect(filesWith("app.saroh.in", /\.startReplay\(/)).toEqual([
            "components/shared/workspace-tracking.tsx",
        ]);
        expect(filesWith("app.saroh.in", /\.startSiteReplay\(/)).toEqual([]);
        // The one place that mounts the recorder also mounts the notice.
        expect(filesWith("app.saroh.in", /<WorkspaceTracking\b/)).toEqual([
            "components/shared/usage-recording.tsx",
        ]);
        expect(filesWith("app.saroh.in", /<UsageNotice\b/)).toEqual([
            "components/shared/usage-recording.tsx",
        ]);
        expect(filesWith("app.saroh.in", /<UsageRecording\b/).sort()).toEqual([
            "app/onboarding/modules/layout.tsx",
            "components/shared/app-shell.tsx",
        ]);
    });

    it("a recording is asked for only where it is switched on, shared, and told", () => {
        const recording = read(
            "app.saroh.in/components/shared/usage-recording.tsx",
        );
        expect(recording).toContain(
            "sharesUsage={recordingOn && sharesUsageNow(read)}",
        );
        expect(recording).toContain("noticeSeen={Boolean(read?.noticeSeenAt)}");
        expect(recording).toContain(
            "{recordingOn && usageNoticeDue(read) ? <UsageNotice /> : null}",
        );
        // Read before the recorder could start, and only when switched on.
        expect(read("app.saroh.in/components/shared/app-shell.tsx")).toContain(
            "recordingOn ? usageSharingOrNull() : null",
        );
        // The recorder is told whether the notice has been shown.
        expect(
            read("app.saroh.in/components/shared/workspace-tracking.tsx"),
        ).toContain("noticeShown,");
    });

    it("on saroh.in only SiteReplay starts it, on the cookie notice's answer", () => {
        expect(filesWith("saroh.in", /\.startSiteReplay\(/)).toEqual([
            "app/site-replay.tsx",
        ]);
        expect(filesWith("saroh.in", /\.startReplay\(/)).toEqual([]);
        expect(filesWith("saroh.in", /<SiteReplay\b/)).toEqual([
            "app/layout.tsx",
        ]);
        const replay = read("saroh.in/app/site-replay.tsx");
        expect(replay).toContain("useAnalyticsConsent(on)");
        expect(replay).toContain('choice === "granted"');
        expect(replay).toContain("isTeamBrowser(document.cookie)");
    });
});
