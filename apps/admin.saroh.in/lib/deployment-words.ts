import type {
    DeployEnvironment,
    DeploymentRow,
    DeploymentsView,
    RunState,
} from "./deployments";

/**
 * Deploy states in words, for client and server components alike (#886).
 * Colour is a reinforcement: every state is said in words.
 */
export const RUN_STATE: Record<
    RunState,
    {
        label: string;
        variant: "success" | "warning" | "error" | "info" | "neutral";
    }
> = {
    queued: { label: "Queued", variant: "info" },
    waiting: { label: "Waiting for approval", variant: "warning" },
    running: { label: "Deploying", variant: "info" },
    succeeded: { label: "Deployed", variant: "success" },
    failed: { label: "Failed", variant: "error" },
    cancelled: { label: "Cancelled", variant: "neutral" },
};

/** Each environment in words: its name, the branch it builds from, its console. */
export const ENVIRONMENT_WORDS: Record<
    DeployEnvironment,
    { title: string; from: string; console: string }
> = {
    production: {
        title: "Production",
        from: "main",
        console: "admin.saroh.in",
    },
    development: {
        title: "Development",
        from: "development",
        console: "admin.saroh.io",
    },
};

/**
 * The one panel a console shows (DEC-107): its own environment's rows, and
 * where the other environment is deployed from. Null when the API names no
 * environment: then nothing can deploy here.
 */
export function ownEnvironmentPanel(view: DeploymentsView): {
    environment: DeployEnvironment;
    title: string;
    description: string;
    otherNote: string;
    rows: DeploymentRow[];
} | null {
    const environment = view.environment;
    if (!environment) return null;
    const own = ENVIRONMENT_WORDS[environment];
    const other =
        ENVIRONMENT_WORDS[
            environment === "production" ? "development" : "production"
        ];
    return {
        environment,
        title: own.title,
        description: `Built from ${own.from}. What is live is read from GitHub Actions: the last deploy that succeeded.`,
        otherNote: `This console deploys ${own.title.toLowerCase()} only. ${other.title} is deployed from its own console, ${other.console}.`,
        rows: view.rows.filter((row) => row.environment === environment),
    };
}

/** What started a run, in words. */
export function triggerWords(trigger: string): string {
    switch (trigger) {
        case "workflow_dispatch":
            return "started by hand";
        case "push":
            return "from a merge";
        case "schedule":
            return "nightly build";
        default:
            return trigger;
    }
}

/** The first seven characters, as GitHub shows a commit. */
export function shortCommit(sha: string): string {
    return sha.slice(0, 7);
}

/** Whether any row is still on its way, so the page should look again soon. */
export function anyInFlight(rows: readonly DeploymentRow[]): boolean {
    return rows.some(
        (row) =>
            row.latestRun !== null &&
            ["queued", "waiting", "running"].includes(row.latestRun.state),
    );
}
