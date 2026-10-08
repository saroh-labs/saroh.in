import { getJson } from "./control-plane";

/**
 * The Cloudflare apps' deploys, as the console reads them (#886). Server-only:
 * it reads through `control-plane.ts`. Client components take its types;
 * words for them live in `deployment-words.ts`.
 */

export type DeployApp = "web" | "application" | "auth" | "admin" | "sites";
export type DeployEnvironment = "development" | "production";

export type RunState =
    "queued" | "waiting" | "running" | "succeeded" | "failed" | "cancelled";

export interface DeploymentRow {
    app: DeployApp;
    label: string;
    environment: DeployEnvironment;
    /** The Worker this app and environment deploys to. */
    worker: string;
    latestRun: {
        state: RunState;
        url: string;
        trigger: string;
        commit: string;
        startedAt: string;
    } | null;
    /** The newest successful deploy job: what is live, per GitHub. */
    lastDeploy: { at: string; commit: string; url: string } | null;
}

export interface DeploymentsView {
    /** False when the API holds no deploy token: nothing can deploy. */
    configured: boolean;
    workflowUrl: string;
    source: "github";
    /** GitHub could not be read: the rows know nothing, which is not "never". */
    readError: string | null;
    rows: DeploymentRow[];
}

export function getDeployments(): Promise<DeploymentsView | null> {
    return getJson<DeploymentsView>("/deployments");
}
