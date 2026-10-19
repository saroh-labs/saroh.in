"use client";

import { Badge } from "@saroh/ui/badge";

import { EmptyPanel } from "@/components/states/empty-panel";
import { formatDate } from "@/lib/format";
import type { OverviewPanel, OverviewUsageRow } from "@/lib/overview-words";
import { usageLine } from "@/lib/overview-words";
import { USAGE_NOTE_WORDS } from "@/lib/plan-words";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { RaiseLimitDialog } from "../plan-actions";
import { OverviewCard } from "./overview-card";

/**
 * Usage this month against its limits (U3, R2), with Raise a limit… for
 * `subscription:override` holders: the Billing tab's raise dialog, opened
 * over Overview. After it goes through the card updates (the action
 * refreshes the page) and wears the highlight.
 */
export function UsageCard({
    organizationId,
    usage,
    canRaise,
}: {
    organizationId: string;
    usage: OverviewPanel<OverviewUsageRow[]>;
    /** Holds `subscription:override`. */
    canRaise: boolean;
}) {
    const feedback = useChangeFeedback();
    const raisable =
        usage.status === "ok"
            ? usage.data.flatMap((row) =>
                  row.raisable && row.planLimit !== null
                      ? [
                            {
                                key: row.key,
                                label: row.label,
                                planValue: row.planLimit,
                            },
                        ]
                      : [],
              )
            : [];

    return (
        <OverviewCard
            id="usage"
            title="Usage this month"
            description="What it uses against its limits."
            data={usage}
            highlighted={feedback.isHighlighted("usage")}
            actions={
                canRaise && raisable.length > 0 ? (
                    <RaiseLimitDialog
                        organizationId={organizationId}
                        limits={raisable}
                        trigger="Raise a limit…"
                        onDone={(message) =>
                            feedback.report({ message, rowId: "usage" })
                        }
                    />
                ) : null
            }
        >
            {(rows) =>
                rows.length === 0 ? (
                    <EmptyPanel
                        title="No limits to count"
                        description="Nothing it has on carries a limit."
                    />
                ) : (
                    <ul className="grid gap-2 text-sm">
                        {rows.map((row) => (
                            <li
                                key={row.key}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                            >
                                <span className="min-w-0">{row.label}</span>
                                {/* A div: `Badge` renders one. */}
                                <div className="flex flex-wrap items-center gap-2 tabular-nums">
                                    {usageLine(row)}
                                    {row.over && (
                                        <Badge variant="warning">
                                            {row.soft
                                                ? "Over, still allowed"
                                                : "Over"}
                                        </Badge>
                                    )}
                                </div>
                                {(row.changed ?? row.note) && (
                                    <span className="w-full text-[12.5px] text-muted-foreground">
                                        {row.changed
                                            ? row.changed.expiresAt
                                                ? `Changed for them until ${formatDate(row.changed.expiresAt)}`
                                                : "Changed for them until removed"
                                            : row.note
                                              ? USAGE_NOTE_WORDS[row.note]
                                              : null}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )
            }
        </OverviewCard>
    );
}
