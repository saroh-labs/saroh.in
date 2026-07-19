"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { completeTask } from "@/lib/leads/actions";
import type { LeadActivity } from "@/lib/leads/service";

/** A friendly label for an activity type. */
function activityLabel(type: string): string {
    switch (type) {
        case "CREATED":
            return "Created";
        case "STAGE_CHANGED":
            return "Stage changed";
        case "NOTE":
            return "Note";
        case "TASK":
            return "Follow-up task";
        default:
            return type;
    }
}

/** The accent colour for each activity type's timeline marker. */
function accent(type: string): string {
    switch (type) {
        case "TASK":
            return "border-amber-400";
        case "NOTE":
            return "border-blue-400";
        case "STAGE_CHANGED":
            return "border-violet-400";
        case "CREATED":
            return "border-emerald-400";
        default:
            return "border-muted";
    }
}

/** The "Mark done" control for a still-open follow-up task. */
function CompleteTaskButton({
    leadId,
    activityId,
}: {
    leadId: string;
    activityId: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function onClick() {
        setBusy(true);
        const res = await completeTask(leadId, activityId);
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Task completed");
        router.refresh();
    }

    return (
        <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onClick}
        >
            {busy ? "Completing…" : "Mark done"}
        </Button>
    );
}

/**
 * The lead's activity timeline (S3-007), newest first. Renders every activity
 * type distinctly — CREATED / STAGE_CHANGED / NOTE / TASK — each with a coloured
 * marker and timestamp. TASKs additionally show their due date and either a
 * "Mark done" control (when open) or a completed state (when `completedAt` is
 * set), driven by the `completeTask` server action.
 */
export function ActivityTimeline({
    leadId,
    activities,
}: {
    leadId: string;
    activities: LeadActivity[];
}) {
    if (activities.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
        );
    }

    return (
        <ol className="space-y-3">
            {activities.map((entry) => {
                const isTask = entry.type === "TASK";
                const done = Boolean(entry.completedAt);
                return (
                    <li
                        key={entry.id}
                        className={`flex flex-wrap items-start justify-between gap-3 border-l-2 pl-4 ${accent(
                            entry.type,
                        )}`}
                    >
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">
                                    {activityLabel(entry.type)}
                                </p>
                                {isTask &&
                                    (done ? (
                                        <Badge variant="secondary">Done</Badge>
                                    ) : (
                                        <Badge variant="outline">Open</Badge>
                                    ))}
                            </div>
                            {entry.body && (
                                <p
                                    className={`text-sm ${
                                        done
                                            ? "text-muted-foreground line-through"
                                            : "text-muted-foreground"
                                    }`}
                                >
                                    {entry.body}
                                </p>
                            )}
                            {isTask && entry.dueAt && (
                                <p className="text-xs text-muted-foreground">
                                    Due {new Date(entry.dueAt).toLocaleString()}
                                    {done && entry.completedAt && (
                                        <>
                                            {" · completed "}
                                            {new Date(
                                                entry.completedAt,
                                            ).toLocaleString()}
                                        </>
                                    )}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                {new Date(entry.createdAt).toLocaleString()}
                            </p>
                        </div>
                        {isTask && !done && (
                            <CompleteTaskButton
                                leadId={leadId}
                                activityId={entry.id}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
