import { EmptyState } from "@saroh/ui/data-state";

import { SessionTab } from "@/components/business/session-tab";
import { Panel } from "@/components/panel";
import type { BusinessTabProps } from "@/lib/business-page";
import { businessGate, tabTitle } from "@/lib/business-page";
import { asWords, formatDateTime } from "@/lib/format";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("History", organizationId) };
}

/**
 * History (admin plan U2): what the business did itself, and every operator
 * action on it with the reason given — two lists, never merged.
 */
export default async function HistoryTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;

    return (
        <SessionTab staff={staff} organizationId={organizationId}>
            {(view) => {
                return (
                    <div className="grid gap-6 xl:grid-cols-2">
                        <Panel
                            title="What the business did"
                            description="Its own recent activity. What operators did to it is a separate list."
                            data={view.activity}
                        >
                            {(rows) =>
                                rows.length === 0 ? (
                                    <EmptyState title="No recorded activity yet" />
                                ) : (
                                    <Timeline
                                        rows={rows.map((row) => ({
                                            id: row.id,
                                            title: asWords(row.action),
                                            detail: `${row.actor ?? (row.actorUserId.startsWith("system:") ? "Saroh, automatically" : "Someone")}${row.outcome === "SUCCESS" ? "" : ` · ${asWords(row.outcome)}`}`,
                                            at: row.createdAt,
                                        }))}
                                    />
                                )
                            }
                        </Panel>
                        <Panel
                            title="What operators did"
                            description="Every operator action on this business, with the reason given."
                            data={view.operatorActions}
                        >
                            {(rows) =>
                                rows.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        Nothing yet.
                                    </p>
                                ) : (
                                    <Timeline
                                        rows={rows.map((row) => ({
                                            id: row.id,
                                            title: asWords(row.action),
                                            detail: [
                                                row.reason,
                                                row.actor ?? "An operator",
                                            ]
                                                .filter(Boolean)
                                                .join(" · "),
                                            at: row.createdAt,
                                        }))}
                                    />
                                )
                            }
                        </Panel>
                    </div>
                );
            }}
        </SessionTab>
    );
}

function Timeline({
    rows,
}: {
    rows: { id: string; title: string; detail: string; at: string }[];
}) {
    return (
        <ol className="grid gap-3">
            {rows.map((row) => (
                <li key={row.id} className="grid gap-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium">{row.title}</span>
                        <time
                            dateTime={row.at}
                            className="font-mono text-[12px] text-muted-foreground"
                        >
                            {formatDateTime(row.at)}
                        </time>
                    </div>
                    <p className="break-words text-[13px] text-muted-foreground">
                        {row.detail}
                    </p>
                </li>
            ))}
        </ol>
    );
}
