import { Badge } from "@saroh/ui/badge";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { Progress } from "@saroh/ui/progress";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { AutoRefresh } from "@/components/operations/auto-refresh";
import { Facts, Panel } from "@/components/panel";
import { requireStaff } from "@/lib/console";
import { formatDateTime } from "@/lib/format";
import { getOperation } from "@/lib/machinery";

export const metadata = { title: "Operation" };

const ITEM: Partial<
    Record<
        string,
        { label: string; variant: "success" | "neutral" | "error" | "info" }
    >
> = {
    PENDING: { label: "Waiting", variant: "neutral" },
    RUNNING: { label: "Running", variant: "info" },
    DONE: { label: "Done", variant: "success" },
    SKIPPED: { label: "Skipped", variant: "neutral" },
    FAILED: { label: "Failed", variant: "error" },
};

/**
 * One bulk operation's record (plan D4): what it was asked to do, why, and
 * what happened to every target. It follows along while the operation runs
 * and stays as the record afterwards.
 */
export default async function OperationPage({
    params,
}: {
    params: Promise<{ operationId: string }>;
}) {
    const gate = await requireStaff("platform:read");
    if (!gate.ok) return gate.screen;
    const { operationId } = await params;
    const operation = await getOperation(operationId).catch(() => null);
    if (!operation) notFound();

    const finished = operation.succeeded + operation.skipped + operation.failed;
    const running =
        operation.status === "PENDING" || operation.status === "RUNNING";
    const title =
        operation.kind === "jobs.retry" ? "Job retry" : "Webhook replay";

    return (
        <AdminShell staff={gate.staff}>
            <PageContainer>
                <AutoRefresh active={running} />
                <PageHeader
                    breadcrumb={["Operations", title]}
                    title={title}
                    description={operation.reason}
                />
                <Panel title={running ? "Running" : "Finished"}>
                    {() => (
                        <div className="grid gap-4">
                            <Progress
                                value={
                                    operation.total === 0
                                        ? 100
                                        : (finished / operation.total) * 100
                                }
                                aria-label={`${finished} of ${operation.total} handled`}
                            />
                            <Facts
                                rows={[
                                    [
                                        "Handled",
                                        `${finished} of ${operation.total}`,
                                    ],
                                    ["Done", String(operation.succeeded)],
                                    ["Skipped", String(operation.skipped)],
                                    ["Failed", String(operation.failed)],
                                    [
                                        "Started",
                                        formatDateTime(operation.createdAt),
                                    ],
                                    [
                                        "Finished",
                                        operation.finishedAt
                                            ? formatDateTime(
                                                  operation.finishedAt,
                                              )
                                            : "Not yet",
                                    ],
                                ]}
                            />
                        </div>
                    )}
                </Panel>
                <Panel
                    title="Every target"
                    description="What happened to each one, and why."
                >
                    {() => (
                        <ul className="grid gap-2">
                            {operation.items.map((item) => (
                                <li
                                    key={item.targetId}
                                    className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 text-sm last:border-0"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words">
                                            {item.detail ?? "—"}
                                        </span>
                                        <span className="font-mono text-[11.5px] text-muted-foreground">
                                            {item.targetId}
                                        </span>
                                    </span>
                                    <Badge
                                        variant={
                                            ITEM[item.status]?.variant ??
                                            "neutral"
                                        }
                                    >
                                        {ITEM[item.status]?.label ??
                                            item.status}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </PageContainer>
        </AdminShell>
    );
}
