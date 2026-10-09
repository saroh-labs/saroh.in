import { Alert, AlertDescription, AlertTitle } from "@saroh/ui/alert";
import { Badge } from "@saroh/ui/badge";
import { FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { DeployButton } from "@/components/deployments/deploy-button";
import { AutoRefresh } from "@/components/operations/auto-refresh";
import { Panel } from "@/components/panel";
import { requireStaff } from "@/lib/console";
import {
    anyInFlight,
    ownEnvironmentPanel,
    RUN_STATE,
    shortCommit,
    triggerWords,
} from "@/lib/deployment-words";
import type { DeploymentRow, DeploymentsView } from "@/lib/deployments";
import { getDeployments } from "@/lib/deployments";
import { formatDateTime, formatRelative } from "@/lib/format";

export const metadata = { title: "Deployments" };

/**
 * The Cloudflare apps in this console's own environment (#886, DEC-107):
 * what is live, when it was deployed and the latest run, with a Deploy
 * button per row. The dev console deploys only dev, the production console
 * only production; the API refuses the other. Platform Owners only. A dev
 * deploy starts at once; production asks for the Worker's name first.
 * Every start is in the audit trail.
 */
export default async function DeploymentsPage() {
    const gate = await requireStaff("deployments:run");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const view = await getDeployments().catch(() => undefined);

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Operations", "Deployments"]}
                    title="Deployments"
                    description="Deploy the web apps on Cloudflare. A deploy from here always builds, even if nothing changed; merges still deploy only what changed."
                />
                {!view ? (
                    <FailedState title="Deployments could not be read" />
                ) : (
                    <Board view={view} />
                )}
            </PageContainer>
        </AdminShell>
    );
}

function Board({ view }: { view: DeploymentsView }) {
    const panel = ownEnvironmentPanel(view);
    return (
        <>
            <AutoRefresh active={anyInFlight(view.rows)} everyMs={15_000} />
            {!view.configured && (
                <Alert>
                    <AlertTitle>Deploys are off on this instance</AlertTitle>
                    <AlertDescription>
                        The API holds no deploy token
                        (SITE_DEPLOY_GITHUB_TOKEN), so nothing can be deployed
                        or read from here. Merges still deploy.
                    </AlertDescription>
                </Alert>
            )}
            {view.readError && (
                <Alert variant="destructive">
                    <AlertTitle>The latest runs could not be read</AlertTitle>
                    <AlertDescription>
                        {view.readError} The rows below don&apos;t show what is
                        live.{" "}
                        <a
                            href={view.workflowUrl}
                            className="underline underline-offset-4"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Open the runs on GitHub
                        </a>
                    </AlertDescription>
                </Alert>
            )}
            {panel ? (
                <>
                    <Panel title={panel.title} description={panel.description}>
                        {() => (
                            <ul className="grid gap-3">
                                {panel.rows.map((row) => (
                                    <Row
                                        key={`${row.app}-${row.environment}`}
                                        row={row}
                                        canDeploy={view.configured}
                                    />
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <p className="text-[13px] text-muted-foreground">
                        {panel.otherNote}
                    </p>
                </>
            ) : (
                <Alert>
                    <AlertTitle>
                        This console doesn&apos;t know which environment it
                        deploys
                    </AlertTitle>
                    <AlertDescription>
                        The API names no environment (SITE_DEPLOY_ENVIRONMENT),
                        so nothing can be deployed from here. Merges still
                        deploy.
                    </AlertDescription>
                </Alert>
            )}
            <p className="text-[13px] text-muted-foreground">
                <a
                    href={view.workflowUrl}
                    className="underline-offset-4 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                >
                    Every run on GitHub
                </a>
            </p>
        </>
    );
}

function Row({ row, canDeploy }: { row: DeploymentRow; canDeploy: boolean }) {
    const run = row.latestRun;
    return (
        <li className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
            <div className="grid min-w-0 gap-0.5">
                <span className="text-sm font-medium">{row.label}</span>
                <span className="break-all font-mono text-[13px] text-muted-foreground">
                    {row.worker}
                </span>
                <span className="text-[13px] text-muted-foreground">
                    {row.lastDeploy ? (
                        <>
                            Live since{" "}
                            <time
                                dateTime={row.lastDeploy.at}
                                title={formatDateTime(row.lastDeploy.at)}
                            >
                                {formatRelative(row.lastDeploy.at)}
                            </time>{" "}
                            ·{" "}
                            <a
                                href={row.lastDeploy.url}
                                className="font-mono underline-offset-4 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {shortCommit(row.lastDeploy.commit)}
                            </a>
                        </>
                    ) : (
                        "No successful deploy in the latest runs."
                    )}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {run ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={RUN_STATE[run.state].variant}>
                            {RUN_STATE[run.state].label}
                        </Badge>
                        <a
                            href={run.url}
                            className="text-[13px] text-muted-foreground underline-offset-4 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {triggerWords(run.trigger)},{" "}
                            {formatRelative(run.startedAt)}
                        </a>
                    </div>
                ) : (
                    <span className="text-[13px] text-muted-foreground">
                        No recent run
                    </span>
                )}
                <DeployButton
                    app={row.app}
                    label={row.label}
                    environment={row.environment}
                    worker={row.worker}
                    disabled={!canDeploy}
                />
            </div>
        </li>
    );
}
