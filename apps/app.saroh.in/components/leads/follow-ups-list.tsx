"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ListCard, ListRow } from "@/components/shared/list-card";
import { ViewerDate } from "@/components/shared/viewer-date";
import { completeTask } from "@/lib/leads/actions";
import type { OpenTask } from "@/lib/leads/service";

/**
 * Every follow-up still to do, soonest first, with the lead it belongs to and
 * the one action it wants: Done. Overdue ones say so in words.
 */
export function FollowUpsList({
    tasks,
    leads,
}: {
    tasks: OpenTask[] | null;
    /** Lead titles and who they are for, by id, to name each task's lead. */
    leads: Record<string, { title: string; who: string | null }>;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);
    // Read once, when the list is drawn: "overdue" is a judgement about the
    // moment the page loaded, and refreshing re-draws it.
    const [now] = useState(() => Date.now());

    if (tasks === null) {
        return (
            <FailedState
                title="Follow-ups could not be loaded"
                description="Nothing has changed and nothing is lost — this list could not be read just now."
                action={
                    <Button variant="outline" onClick={() => router.refresh()}>
                        Try again
                    </Button>
                }
            />
        );
    }
    if (tasks.length === 0) {
        return (
            <EmptyState
                icon={<CalendarCheck />}
                title="Nothing to follow up"
                description="A follow-up set on a lead lands here with its date, so it waits in one place instead of inside a lead nobody opens."
            />
        );
    }

    async function done(task: OpenTask) {
        setBusy(task.id);
        const res = await completeTask(task.leadId, task.id);
        setBusy(null);
        if (!res.ok) return showError(res.error);
        showSuccess("Done");
        router.refresh();
    }

    return (
        <ListCard
            main="Follow-up"
            end="Due"
            note="Marking one done records it on the lead's activity. A new follow-up is set from the lead."
        >
            {tasks.map((t) => {
                const lead = leads[t.leadId] as
                    { title: string; who: string | null } | undefined;
                const overdue =
                    t.dueAt !== null && new Date(t.dueAt).getTime() < now;
                return (
                    <li
                        key={t.id}
                        className="border-b border-border last:border-b-0"
                    >
                        <ListRow
                            title={t.body?.trim() ?? "Follow up"}
                            sub={
                                <Link
                                    href={`/leads/${t.leadId}`}
                                    className="underline-offset-4 hover:text-foreground hover:underline"
                                >
                                    {lead
                                        ? `${lead.title}${lead.who ? ` · ${lead.who}` : ""}`
                                        : "Open the lead"}
                                </Link>
                            }
                            end={
                                <>
                                    <span
                                        className={cn(
                                            "whitespace-nowrap text-[12px] tabular-nums",
                                            overdue
                                                ? "font-medium text-warning-subtle-foreground"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {t.dueAt ? (
                                            <>
                                                {overdue ? "Overdue · " : ""}
                                                <ViewerDate
                                                    iso={t.dueAt}
                                                    variant="heading"
                                                />
                                            </>
                                        ) : (
                                            "No date"
                                        )}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy === t.id}
                                        aria-label={`Mark "${t.body ?? "follow-up"}" done`}
                                        onClick={() => void done(t)}
                                    >
                                        Done
                                    </Button>
                                </>
                            }
                        />
                    </li>
                );
            })}
        </ListCard>
    );
}
