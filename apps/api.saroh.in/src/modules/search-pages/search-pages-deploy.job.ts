import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";

import { requestFor, revalidateHook } from "../pricing/revalidate-site.job";

/**
 * Rebuild saroh.in once Deploy changes releases staged pages (DEC-193, R13): a
 * `workflow_dispatch` of `deploy-frontends.yml` for the marketing site in
 * this API's environment — the dispatch pricing's publish and the console's
 * Deployments use (`revalidateHook`).
 *
 * Queued on the action's own transaction (the outbox), so the worker runs it
 * only once the change has committed, and a GitHub failure never undoes a
 * deploy: the call throws and the queue retries it. Two builds are harmless.
 * Only the deploy rebuilds `/for/` pages, so the older revalidate hook is
 * not a fallback here: with no deploy configured, nothing is queued.
 */
export const SEARCH_PAGES_DEPLOY_TYPE = "search-pages.site.deploy";

/** True when this API can start a web deploy. */
export function canDeployWeb(): boolean {
    return revalidateHook()?.kind === "deploy";
}

/** The paths a deploy job carries (its payload), or none. */
export function pathsOf(payload: unknown): string[] {
    const paths = (payload as { paths?: unknown } | null)?.paths;
    return Array.isArray(paths)
        ? paths.filter((p): p is string => typeof p === "string")
        : [];
}

/**
 * Queue one web deploy on the caller's transaction; false when none can
 * run. A deploy still waiting to start takes these paths too, so a second
 * Deploy changes never queues a second rebuild.
 */
export async function enqueueWebDeploy(
    tx: Pick<Prisma.TransactionClient, "job">,
    paths: string[],
): Promise<boolean> {
    if (!canDeployWeb()) return false;
    const waiting = await tx.job.findFirst({
        where: { type: SEARCH_PAGES_DEPLOY_TYPE, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { id: true, payload: true },
    });
    if (waiting) {
        const all = [...new Set([...pathsOf(waiting.payload), ...paths])];
        // Re-checked on write: a worker that claimed it meanwhile wins, and
        // this deploy gets its own job.
        const { count } = await tx.job.updateMany({
            where: { id: waiting.id, status: "PENDING" },
            data: { payload: { paths: all.sort() } },
        });
        if (count === 1) return true;
    }
    await tx.job.create({
        data: { type: SEARCH_PAGES_DEPLOY_TYPE, payload: { paths } },
    });
    return true;
}

@Injectable()
export class SearchPagesDeployHandler {
    private readonly logger = new Logger(SearchPagesDeployHandler.name);

    /** The HTTP call; a spec swaps it for a fake. */
    fetchFn: typeof fetch = (input, init) => fetch(input, init);

    readonly handle = async (job: Job): Promise<void> => {
        const hook = revalidateHook();
        if (hook?.kind !== "deploy") {
            // Configured when queued, unset since: nothing to call.
            this.logger.warn(`search_pages_deploy_unconfigured job=${job.id}`);
            return;
        }
        let res: Response | null = null;
        let failure = "";
        try {
            res = await this.fetchFn(hook.url, requestFor(hook));
        } catch (error) {
            failure = error instanceof Error ? error.name : "unknown";
        }
        if (!res?.ok) {
            const why = res ? `status=${res.status}` : `error=${failure}`;
            this.logger.warn(`search_pages_deploy_failed job=${job.id} ${why}`);
            throw new Error(`saroh.in deploy not started (${why})`);
        }
        this.logger.log(`search_pages_deploy_started job=${job.id}`);
    };
}
