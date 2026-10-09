/**
 * The Cloudflare apps the console can deploy (#886, DEC-107), and how a
 * GitHub Actions run of `deploy-frontends.yml` is read back into a row per
 * app and environment. Pure: no HTTP, no database, so the reading rules are
 * pinned by a spec without either.
 */

/** Turbo package names, as `deploy-frontends.yml` and `scripts/cf-plan.mjs` name them. */
export const DEPLOY_APPS = [
    "web",
    "application",
    "auth",
    "admin",
    "sites",
] as const;
export type DeployApp = (typeof DEPLOY_APPS)[number];

export const DEPLOY_ENVIRONMENTS = ["development", "production"] as const;
export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

/**
 * Each app in words and its Worker per environment. The Worker names are the
 * ones in each app's `wrangler.jsonc` (`admin-deployments.spec.ts` reads them
 * there, so the two cannot drift). A production deploy is confirmed by typing
 * the production Worker's name.
 */
export const DEPLOY_APP_INFO: Record<
    DeployApp,
    { label: string; workers: Record<DeployEnvironment, string>; dir: string }
> = {
    web: {
        label: "Marketing site",
        workers: { development: "saroh-web-dev", production: "saroh-web" },
        dir: "apps/saroh.in",
    },
    application: {
        label: "Workspace",
        workers: { development: "saroh-app-dev", production: "saroh-app" },
        dir: "apps/app.saroh.in",
    },
    auth: {
        label: "Accounts",
        workers: {
            development: "saroh-accounts-dev",
            production: "saroh-accounts",
        },
        dir: "apps/accounts.saroh.in",
    },
    admin: {
        label: "Admin",
        workers: { development: "saroh-admin-dev", production: "saroh-admin" },
        dir: "apps/admin.saroh.in",
    },
    sites: {
        label: "Merchant sites",
        workers: { development: "saroh-sites-dev", production: "saroh-sites" },
        dir: "apps/saroh.app",
    },
};

/**
 * The branch a deploy runs from. The GitHub environments that hold the
 * secrets only open to their own branch (`cloudflare-production` to `main`,
 * `cloudflare-development` to `development`), so the run must start there.
 */
export function branchFor(
    environment: DeployEnvironment,
): "main" | "development" {
    return environment === "production" ? "main" : "development";
}

/** The run's title for a manual run (the workflow's `run-name`). */
export function runTitle(
    app: DeployApp | "all",
    environment: DeployEnvironment,
): string {
    return `Deploy ${app} to ${environment}`;
}

/** The deploy job's name in a run (`Deploy ${{ matrix.pkg }} (${{ matrix.env }})`). */
export function jobName(
    app: DeployApp,
    environment: DeployEnvironment,
): string {
    return `Deploy ${app} (${environment})`;
}

/** What the console says about a run or job, from GitHub's status and conclusion. */
export type RunState =
    "queued" | "waiting" | "running" | "succeeded" | "failed" | "cancelled";

/** The fields read from GitHub's `workflow_run` object. */
export interface GithubRun {
    id: number;
    event: string;
    status: string | null;
    conclusion: string | null;
    html_url: string;
    head_sha: string;
    display_title?: string | null;
    created_at: string;
}

/** The fields read from GitHub's `job` object. */
export interface GithubJob {
    name: string;
    status: string | null;
    conclusion: string | null;
    html_url: string | null;
    started_at: string | null;
    completed_at: string | null;
}

export function stateOf(
    status: string | null,
    conclusion: string | null,
): RunState {
    switch (status) {
        case "completed":
            if (conclusion === "success") return "succeeded";
            if (conclusion === "cancelled" || conclusion === "skipped") {
                return "cancelled";
            }
            return "failed";
        case "in_progress":
            return "running";
        case "waiting":
            return "waiting";
        default:
            // queued, requested, pending, or anything GitHub adds later.
            return "queued";
    }
}

export interface DeploymentRun {
    state: RunState;
    /** The run (or its job for this app) on GitHub. */
    url: string;
    /** `workflow_dispatch` (the console or a person on GitHub), `push`, `schedule`. */
    trigger: string;
    commit: string;
    startedAt: string;
}

export interface DeploymentRow {
    app: DeployApp;
    label: string;
    environment: DeployEnvironment;
    worker: string;
    /** The newest run that deploys (or will deploy) this app here. */
    latestRun: DeploymentRun | null;
    /** The newest deploy job for this app here that succeeded: what is live. */
    lastDeploy: { at: string; commit: string; url: string } | null;
}

/**
 * One row per app and environment from the newest runs (newest first) and the
 * jobs read for some of them. A run counts for a row when it has that row's
 * deploy job, or, before its jobs exist or were read, when it is a manual run
 * titled for that app (or for all apps) in that environment. Only the given
 * environments get rows: a console reads only its own (DEC-107).
 */
export function deploymentRows(
    runs: readonly GithubRun[],
    jobsByRun: ReadonlyMap<number, readonly GithubJob[]>,
    environments: readonly DeployEnvironment[] = DEPLOY_ENVIRONMENTS,
): DeploymentRow[] {
    const rows: DeploymentRow[] = [];
    for (const environment of environments) {
        for (const app of DEPLOY_APPS) {
            rows.push(rowFor(app, environment, runs, jobsByRun));
        }
    }
    return rows;
}

function rowFor(
    app: DeployApp,
    environment: DeployEnvironment,
    runs: readonly GithubRun[],
    jobsByRun: ReadonlyMap<number, readonly GithubJob[]>,
): DeploymentRow {
    const name = jobName(app, environment);
    const titles = new Set([
        runTitle(app, environment),
        runTitle("all", environment),
    ]);
    let latestRun: DeploymentRun | null = null;
    let lastDeploy: DeploymentRow["lastDeploy"] = null;

    for (const run of runs) {
        const job = jobsByRun.get(run.id)?.find((j) => j.name === name);
        if (!latestRun) {
            if (job) {
                latestRun = {
                    state: stateOf(job.status, job.conclusion),
                    url: job.html_url ?? run.html_url,
                    trigger: run.event,
                    commit: run.head_sha,
                    startedAt: job.started_at ?? run.created_at,
                };
            } else if (
                run.event === "workflow_dispatch" &&
                titles.has(run.display_title ?? "")
            ) {
                latestRun = {
                    state: stateOf(run.status, run.conclusion),
                    url: run.html_url,
                    trigger: run.event,
                    commit: run.head_sha,
                    startedAt: run.created_at,
                };
            }
        }
        if (
            !lastDeploy &&
            job &&
            stateOf(job.status, job.conclusion) === "succeeded"
        ) {
            lastDeploy = {
                at: job.completed_at ?? run.created_at,
                commit: run.head_sha,
                url: job.html_url ?? run.html_url,
            };
        }
        if (latestRun && lastDeploy) break;
    }

    return {
        app,
        label: DEPLOY_APP_INFO[app].label,
        environment,
        worker: DEPLOY_APP_INFO[app].workers[environment],
        latestRun,
        lastDeploy,
    };
}
