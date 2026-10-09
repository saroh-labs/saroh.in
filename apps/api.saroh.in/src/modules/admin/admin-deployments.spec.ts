import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { GithubJob, GithubRun } from "./admin-deployments";
import {
    branchFor,
    DEPLOY_APP_INFO,
    DEPLOY_APPS,
    deploymentRows,
    jobName,
    runTitle,
    stateOf,
} from "./admin-deployments";

const ROOT = resolve(__dirname, "../../../../..");

const run = (over: Partial<GithubRun> & { id: number }): GithubRun => ({
    event: "push",
    status: "completed",
    conclusion: "success",
    html_url: `https://github.example.test/runs/${over.id}`,
    head_sha: `sha${over.id}`,
    display_title: "a commit",
    created_at: `2026-10-08T0${over.id}:00:00Z`,
    ...over,
});

const job = (name: string, over: Partial<GithubJob> = {}): GithubJob => ({
    name,
    status: "completed",
    conclusion: "success",
    html_url: `https://github.example.test/jobs/${name}`,
    started_at: "2026-10-08T00:01:00Z",
    completed_at: "2026-10-08T00:05:00Z",
    ...over,
});

const row = (
    rows: ReturnType<typeof deploymentRows>,
    app: string,
    env: string,
) => rows.find((r) => r.app === app && r.environment === env);

describe("deployable apps (#886)", () => {
    it.each(DEPLOY_APPS)(
        "%s names the Workers its wrangler.jsonc deploys",
        (app) => {
            const info = DEPLOY_APP_INFO[app];
            const config = readFileSync(
                join(ROOT, info.dir, "wrangler.jsonc"),
                "utf8",
            );
            for (const worker of Object.values(info.workers)) {
                expect(config).toContain(`"name": "${worker}"`);
            }
        },
    );

    it("lists every app the workflow can deploy, and only those", () => {
        const workflow = readFileSync(
            join(ROOT, ".github/workflows/deploy-frontends.yml"),
            "utf8",
        );
        expect(workflow).toContain(`options: [${DEPLOY_APPS.join(", ")}, all]`);
        expect(workflow).toContain("format('Deploy {0} to {1}'");
        expect(workflow).toContain(
            "name: Deploy ${{ matrix.pkg }} (${{ matrix.env }})",
        );
    });

    it("runs production from main and dev from development", () => {
        expect(branchFor("production")).toBe("main");
        expect(branchFor("development")).toBe("development");
    });
});

describe("stateOf", () => {
    it.each([
        ["queued", null, "queued"],
        ["requested", null, "queued"],
        ["waiting", null, "waiting"],
        ["in_progress", null, "running"],
        ["completed", "success", "succeeded"],
        ["completed", "failure", "failed"],
        ["completed", "timed_out", "failed"],
        ["completed", "cancelled", "cancelled"],
    ] as const)("%s/%s is %s", (status, conclusion, state) => {
        expect(stateOf(status, conclusion)).toBe(state);
    });
});

describe("deploymentRows", () => {
    it("has a row per app and environment, empty when nothing was read", () => {
        const rows = deploymentRows([], new Map());
        expect(rows).toHaveLength(10);
        expect(row(rows, "web", "production")).toMatchObject({
            label: "Marketing site",
            worker: "saroh-web",
            latestRun: null,
            lastDeploy: null,
        });
    });

    it("reads an app's latest run and last success from its own deploy job", () => {
        const runs = [
            run({ id: 3, status: "in_progress", conclusion: null }),
            run({ id: 2 }),
            run({ id: 1 }),
        ];
        const jobs = new Map<number, GithubJob[]>([
            [
                3,
                [
                    job(jobName("admin", "production"), {
                        status: "in_progress",
                        conclusion: null,
                        completed_at: null,
                    }),
                ],
            ],
            [2, [job(jobName("web", "production"))]],
            [1, [job(jobName("admin", "production"))]],
        ]);
        const rows = deploymentRows(runs, jobs);

        expect(row(rows, "admin", "production")).toMatchObject({
            latestRun: { state: "running", commit: "sha3", trigger: "push" },
            lastDeploy: { commit: "sha1" },
        });
        // Run 3 deployed nothing for web: its latest run is still run 2.
        expect(row(rows, "web", "production")).toMatchObject({
            latestRun: { state: "succeeded", commit: "sha2" },
            lastDeploy: { commit: "sha2" },
        });
        // Nothing for dev.
        expect(row(rows, "admin", "development")?.latestRun).toBeNull();
    });

    it("counts a manual run by its title before its jobs exist", () => {
        const runs = [
            run({
                id: 2,
                event: "workflow_dispatch",
                status: "queued",
                conclusion: null,
                display_title: runTitle("sites", "development"),
            }),
            run({
                id: 1,
                event: "workflow_dispatch",
                status: "queued",
                conclusion: null,
                display_title: runTitle("all", "production"),
            }),
        ];
        const rows = deploymentRows(runs, new Map());

        expect(row(rows, "sites", "development")?.latestRun).toMatchObject({
            state: "queued",
            trigger: "workflow_dispatch",
            url: "https://github.example.test/runs/2",
        });
        expect(row(rows, "sites", "production")?.latestRun?.commit).toBe(
            "sha1",
        );
        expect(row(rows, "web", "production")?.latestRun?.commit).toBe("sha1");
        expect(row(rows, "web", "development")?.latestRun).toBeNull();
    });

    it("never takes a failed job as what is live", () => {
        const runs = [run({ id: 2 }), run({ id: 1 })];
        const jobs = new Map<number, GithubJob[]>([
            [
                2,
                [
                    job(jobName("auth", "development"), {
                        conclusion: "failure",
                    }),
                ],
            ],
            [1, [job(jobName("auth", "development"))]],
        ]);
        const auth = row(deploymentRows(runs, jobs), "auth", "development");
        expect(auth?.latestRun?.state).toBe("failed");
        expect(auth?.lastDeploy?.commit).toBe("sha1");
    });
});
