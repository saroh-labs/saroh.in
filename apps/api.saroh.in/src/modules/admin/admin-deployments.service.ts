import {
    BadGatewayException,
    BadRequestException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { env } from "../../env";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import {
    SITE_DEPLOY_REPO,
    SITE_DEPLOY_WORKFLOW,
} from "../pricing/revalidate-site.job";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type {
    DeployApp,
    DeployEnvironment,
    DeploymentRow,
    GithubJob,
    GithubRun,
} from "./admin-deployments";
import {
    branchFor,
    DEPLOY_APP_INFO,
    deploymentRows,
} from "./admin-deployments";
import { AdminPermission } from "./admin-permissions";

const GITHUB_API = "https://api.github.com";
/** How long one GitHub call may take. */
const CALL_TIMEOUT_MS = 10_000;
/** The newest runs read, and how many of them have their jobs read. */
const RUNS_READ = 20;
const JOBS_READ = 8;
/** The board is read again at most this often, however often the page loads. */
const CACHE_MS = 15_000;

export interface DeploymentsView {
    /** False when the API holds no `SITE_DEPLOY_GITHUB_TOKEN`: nothing can deploy. */
    configured: boolean;
    /**
     * The one environment this console deploys (`SITE_DEPLOY_ENVIRONMENT`):
     * the dev console deploys only dev, the production console only
     * production (DEC-107, owner 2026-10-09). Null when the API names none:
     * then nothing can deploy, and there are no rows.
     */
    environment: DeployEnvironment | null;
    /** The workflow's runs on GitHub. */
    workflowUrl: string;
    /**
     * Where the live state comes from. Only GitHub for now: the API holds no
     * Cloudflare read token, so the Worker's own `BUILD_FINGERPRINT` and
     * deploy time are not read (#886).
     */
    source: "github";
    /** Set when GitHub could not be read: the rows then know nothing, which is not "never deployed". */
    readError: string | null;
    rows: DeploymentRow[];
}

export interface StartDeploymentInput {
    app: DeployApp;
    environment: DeployEnvironment;
    /** The production Worker's name, typed back. Needed for production only. */
    confirm?: string;
    reason?: string;
}

export interface StartedDeployment {
    app: DeployApp;
    environment: DeployEnvironment;
    ref: "main" | "development";
    workflowUrl: string;
}

/**
 * Deploy a Cloudflare app from the console (#886, DEC-107): Platform Owners
 * start `deploy-frontends.yml` through GitHub's `workflow_dispatch`, for one
 * app, and read back each app's latest run.
 *
 * Each console deploys only its own environment: the API's
 * `SITE_DEPLOY_ENVIRONMENT` (`development` on api.saroh.io, `production` on
 * api.saroh.in). A start for the other environment is refused (403) and on
 * the record as DENIED; with no environment set, every start is refused
 * (fail closed). The list holds this environment's rows only.
 *
 * The API's token (`SITE_DEPLOY_GITHUB_TOKEN`) can only run this repository's
 * workflows on code already on a branch, so no code comes from the console.
 * A console deploy always builds (`FORCE=1` in the workflow), even if nothing
 * changed.
 *
 * Every start is in the admin audit ledger, and so is every one refused for
 * its environment or by the rate limit (DENIED) or by GitHub (FAILURE): who
 * (`actorUserId`), which app and environment (target and metadata), when
 * (`createdAt`). Starts are rate-limited per app and environment and per
 * operator, per API instance ({@link FixedWindowRateLimiter}).
 */
@Injectable()
export class AdminDeploymentsService {
    private readonly logger = new Logger(AdminDeploymentsService.name);
    private cached: { at: number; view: DeploymentsView } | null = null;

    /** The HTTP call; a spec swaps it for a fake. */
    fetchFn: typeof fetch = (input, init) => fetch(input, init);
    now: () => number = () => Date.now();

    constructor(
        private readonly audit: AdminAuditService,
        // Not DI providers: per-instance defaults a spec can replace.
        // One start per app and environment every two minutes: a run takes
        // longer than that, so a second press only queues a duplicate.
        @Optional()
        private readonly perTarget: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            1,
            2 * 60_000,
        ),
        @Optional()
        private readonly perOperator: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            10,
            60 * 60_000,
        ),
    ) {}

    async list(): Promise<DeploymentsView> {
        const now = this.now();
        if (this.cached && now - this.cached.at < CACHE_MS) {
            return this.cached.view;
        }
        const view = await this.read();
        this.cached = { at: now, view };
        return view;
    }

    async start(
        staff: PlatformAdminInfo,
        input: StartDeploymentInput,
    ): Promise<StartedDeployment> {
        const { app, environment } = input;
        const info = DEPLOY_APP_INFO[app];
        const token = env.SITE_DEPLOY_GITHUB_TOKEN;
        if (!token) {
            throw new ServiceUnavailableException(
                "Deploys from the console need SITE_DEPLOY_GITHUB_TOKEN on the API.",
            );
        }
        const own = ownEnvironment();
        if (!own) {
            await this.record(staff, input, AdminAuditOutcome.Denied, {
                refused: "environment_unset",
            });
            throw new ServiceUnavailableException(
                "This console doesn't know which environment it deploys: SITE_DEPLOY_ENVIRONMENT is not set on the API. Nothing was deployed.",
            );
        }
        if (environment !== own) {
            await this.record(staff, input, AdminAuditOutcome.Denied, {
                refused: "other_environment",
                consoleEnvironment: own,
            });
            throw new ForbiddenException(
                `This console deploys only to ${own}. Deploy ${info.label} to ${environment} from the ${environment} console. Nothing was deployed.`,
            );
        }
        if (
            environment === "production" &&
            input.confirm?.trim() !== info.workers.production
        ) {
            throw new BadRequestException(
                `Type ${info.workers.production} to deploy ${info.label} to production.`,
            );
        }
        const now = this.now();
        if (
            !this.perOperator.take(staff.userId, now) ||
            !this.perTarget.take(`${app}:${environment}`, now)
        ) {
            await this.record(staff, input, AdminAuditOutcome.Denied, {
                refused: "rate_limited",
            });
            throw new HttpException(
                `${info.label} was just deployed to ${environment}. Wait a couple of minutes, then try again.`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const ref = branchFor(environment);
        let status: number | null = null;
        let failure = "";
        try {
            const res = await this.fetchFn(
                `${GITHUB_API}/repos/${repo()}/actions/workflows/${SITE_DEPLOY_WORKFLOW}/dispatches`,
                {
                    method: "POST",
                    headers: githubHeaders(token),
                    body: JSON.stringify({
                        ref,
                        inputs: { app, environment },
                    }),
                    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
                },
            );
            status = res.status;
        } catch (error) {
            failure = error instanceof Error ? error.name : "unknown";
        }

        if (status === null || status < 200 || status >= 300) {
            this.logger.warn(
                `deployment_start_failed app=${app} env=${environment} status=${status ?? "none"} error=${failure || "-"}`,
            );
            await this.record(staff, input, AdminAuditOutcome.Failure, {
                githubStatus: status,
            });
            throw new BadGatewayException(
                status === null
                    ? "GitHub could not be reached. Nothing was deployed."
                    : `GitHub refused the deploy (${status}). Nothing was deployed.`,
            );
        }

        this.cached = null;
        await this.record(staff, input, AdminAuditOutcome.Success, { ref });
        this.logger.log(
            `deployment_started app=${app} env=${environment} ref=${ref} actor=${staff.userId}`,
        );
        return { app, environment, ref, workflowUrl: workflowUrl() };
    }

    /**
     * Write the ledger row. A start that GitHub accepted is not undone if the
     * ledger can't be written: the failure is logged with everything the row
     * would have held, so the deploy is still on a record.
     */
    private async record(
        staff: PlatformAdminInfo,
        input: StartDeploymentInput,
        outcome: AdminAuditOutcome,
        extra: Record<string, string | number | null>,
    ): Promise<void> {
        const worker = DEPLOY_APP_INFO[input.app].workers[input.environment];
        try {
            await this.audit.write(prisma, {
                actorUserId: staff.userId,
                permission: AdminPermission.DeploymentsRun,
                action: "deployment.start",
                targetType: "cloudflare_app",
                targetId: `${input.app}:${input.environment}`,
                reason: input.reason?.trim() ? input.reason.trim() : undefined,
                outcome,
                metadata: {
                    app: input.app,
                    environment: input.environment,
                    worker,
                    ...extra,
                },
            });
        } catch (error) {
            this.logger.error(
                `deployment_audit_failed app=${input.app} env=${input.environment} actor=${staff.userId} outcome=${outcome} error=${error instanceof Error ? error.message : "unknown"}`,
            );
        }
    }

    private async read(): Promise<DeploymentsView> {
        const environment = ownEnvironment();
        const environments = environment ? [environment] : [];
        const base = {
            configured: Boolean(env.SITE_DEPLOY_GITHUB_TOKEN),
            environment,
            workflowUrl: workflowUrl(),
            source: "github" as const,
        };
        const token = env.SITE_DEPLOY_GITHUB_TOKEN;
        if (!token || !environment) {
            return {
                ...base,
                readError: null,
                rows: deploymentRows([], new Map(), environments),
            };
        }
        try {
            const { workflow_runs: runs } = await this.get<{
                workflow_runs: GithubRun[];
            }>(
                token,
                `/repos/${repo()}/actions/workflows/${SITE_DEPLOY_WORKFLOW}/runs?per_page=${RUNS_READ}`,
            );
            const jobs = await Promise.all(
                runs.slice(0, JOBS_READ).map(async (run) => {
                    const body = await this.get<{ jobs: GithubJob[] }>(
                        token,
                        `/repos/${repo()}/actions/runs/${run.id}/jobs?per_page=30&filter=latest`,
                    );
                    return [run.id, body.jobs] as const;
                }),
            );
            return {
                ...base,
                readError: null,
                rows: deploymentRows(runs, new Map(jobs), environments),
            };
        } catch (error) {
            const message =
                error instanceof GithubReadError
                    ? `GitHub answered ${error.status}.`
                    : "GitHub could not be reached.";
            this.logger.warn(`deployments_read_failed ${message}`);
            return {
                ...base,
                readError: message,
                rows: deploymentRows([], new Map(), environments),
            };
        }
    }

    private async get<T>(token: string, path: string): Promise<T> {
        const res = await this.fetchFn(`${GITHUB_API}${path}`, {
            headers: githubHeaders(token),
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });
        if (!res.ok) throw new GithubReadError(res.status);
        return (await res.json()) as T;
    }
}

class GithubReadError extends Error {
    constructor(readonly status: number) {
        super(`GitHub answered ${status}`);
    }
}

/** The environment this API (and so its console) deploys, if it names one. */
function ownEnvironment(): DeployEnvironment | null {
    return env.SITE_DEPLOY_ENVIRONMENT ?? null;
}

function repo(): string {
    return env.SITE_DEPLOY_GITHUB_REPO ?? SITE_DEPLOY_REPO;
}

function workflowUrl(): string {
    return `https://github.com/${repo()}/actions/workflows/${SITE_DEPLOY_WORKFLOW}`;
}

function githubHeaders(token: string): Record<string, string> {
    return {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
    };
}
