import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";

import { env } from "../../env";

/**
 * Tell saroh.in that the published pricing changed (plans catalogue KTD-10):
 * after a publish commits, and again at a scheduled version's go-live.
 *
 * saroh.in is static (it reads the catalogue when it is built), so the usual
 * way is to start its build: a `workflow_dispatch` of the frontends' deploy
 * workflow for the marketing site, in this API's environment
 * (`SITE_DEPLOY_GITHUB_TOKEN`, `SITE_DEPLOY_ENVIRONMENT`). The older hook,
 * `POST <PRICING_SITE_URL>/api/revalidate`, is used only when that isn't set.
 *
 * The job row is written in the publish's own transaction (the outbox), so
 * it exists exactly when the version does, and the worker only sees it once
 * that transaction has committed: "after commit" without a post-commit hook.
 * The call is best-effort for the publish (a site that is down never undoes
 * one) and at-least-once for the site: a failed call throws, and the queue
 * retries it with backoff. Revalidating twice is harmless.
 *
 * The hook's contract, which saroh.in's `/api/revalidate` (U24) implements:
 * `POST`, the shared secret in `x-saroh-revalidate` (compared in
 * constant time there), no body and no path — the site revalidates its
 * own fixed list. The payload's `version` is for the logs only.
 */
export const PRICING_REVALIDATE_TYPE = "pricing.site.revalidate";

/** The header saroh.in reads the shared secret from. */
export const REVALIDATE_SECRET_HEADER = "x-saroh-revalidate";

/** saroh.in's hook, under its base URL. */
export const REVALIDATE_PATH = "/api/revalidate";

/** The workflow that builds and deploys the frontends, saroh.in among them. */
export const SITE_DEPLOY_WORKFLOW = "deploy-frontends.yml";

/** The repository it lives in, unless `SITE_DEPLOY_GITHUB_REPO` says otherwise. */
export const SITE_DEPLOY_REPO = "saroh-labs/saroh.in";

/** How long one call may take before it counts as failed (and is retried). */
const CALL_TIMEOUT_MS = 10_000;

export interface RevalidatePayload {
    version: number;
    /** Why: a publish (or roll back) that is live now, or a go-live. */
    cause: "publish" | "go-live";
}

export type SiteRefresh =
    | { kind: "deploy"; url: string; token: string; body: string }
    | { kind: "revalidate"; url: string; secret: string };

/** Where to call and with what, or null when neither way is configured. */
export function revalidateHook(): SiteRefresh | null {
    const token = env.SITE_DEPLOY_GITHUB_TOKEN;
    const environment = env.SITE_DEPLOY_ENVIRONMENT;
    if (token && environment) {
        const repo = env.SITE_DEPLOY_GITHUB_REPO ?? SITE_DEPLOY_REPO;
        return {
            kind: "deploy",
            url: `https://api.github.com/repos/${repo}/actions/workflows/${SITE_DEPLOY_WORKFLOW}/dispatches`,
            token,
            body: JSON.stringify({
                ref: environment === "production" ? "main" : "development",
                inputs: { app: "web", environment },
            }),
        };
    }
    const base = env.PRICING_SITE_URL;
    const secret = env.PRICING_REVALIDATE_SECRET;
    if (!base || !secret) return null;
    return {
        kind: "revalidate",
        url: new URL(REVALIDATE_PATH, base).toString(),
        secret,
    };
}

function requestFor(hook: SiteRefresh): RequestInit {
    if (hook.kind === "deploy") {
        return {
            method: "POST",
            headers: {
                accept: "application/vnd.github+json",
                authorization: `Bearer ${hook.token}`,
                "content-type": "application/json",
                "x-github-api-version": "2022-11-28",
            },
            body: hook.body,
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        };
    }
    return {
        method: "POST",
        headers: { [REVALIDATE_SECRET_HEADER]: hook.secret },
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    };
}

/**
 * Queue a revalidation on the caller's transaction. Writes nothing when the
 * hook isn't configured: a job that could only no-op is never queued
 * (backend-jobs.md), and saroh.in then shows the change at its next deploy.
 */
export async function enqueueSiteRevalidation(
    tx: Pick<Prisma.TransactionClient, "job">,
    payload: RevalidatePayload,
    runAt: Date,
): Promise<boolean> {
    if (!revalidateHook()) return false;
    await tx.job.create({
        data: {
            type: PRICING_REVALIDATE_TYPE,
            payload: { ...payload },
            runAt,
        },
    });
    return true;
}

@Injectable()
export class RevalidateSiteHandler {
    private readonly logger = new Logger(RevalidateSiteHandler.name);

    /** The HTTP call; a spec swaps it for a fake. */
    fetchFn: typeof fetch = (input, init) => fetch(input, init);

    readonly handle = async (job: Job): Promise<void> => {
        const hook = revalidateHook();
        const version = readVersion(job.payload);
        if (!hook) {
            // Configured when queued, unset since: nothing to call.
            this.logger.warn(
                `pricing_revalidate_unconfigured job=${job.id} version=${version ?? "?"}`,
            );
            return;
        }
        let res: Response | null = null;
        let failure = "";
        try {
            res = await this.fetchFn(hook.url, requestFor(hook));
        } catch (error) {
            failure = error instanceof Error ? error.name : "unknown";
        }
        if (!res) {
            this.logger.warn(
                `pricing_revalidate_unreachable job=${job.id} version=${version ?? "?"} error=${failure}`,
            );
            throw new Error(`saroh.in revalidation unreachable (${failure})`);
        }
        if (!res.ok) {
            this.logger.warn(
                `pricing_revalidate_refused job=${job.id} version=${version ?? "?"} status=${res.status}`,
            );
            throw new Error(`saroh.in revalidation answered ${res.status}`);
        }
        this.logger.log(
            `pricing_revalidated job=${job.id} version=${version ?? "?"} via=${hook.kind}`,
        );
    };
}

function readVersion(payload: unknown): number | null {
    if (payload && typeof payload === "object" && "version" in payload) {
        const v = payload.version;
        return typeof v === "number" ? v : null;
    }
    return null;
}
