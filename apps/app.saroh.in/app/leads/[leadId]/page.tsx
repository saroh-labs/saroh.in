import { Badge } from "@saroh/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadStatusControl } from "@/components/crm/lead-status-control";
import { MoveStageControl } from "@/components/crm/move-stage-control";
import { contactName, formatValue } from "@/lib/crm/format";
import { getLead } from "@/lib/leads/service";
import { requireSession } from "@/lib/session";

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
            return "Task";
        default:
            return type;
    }
}

/**
 * Lead detail (S3-005): the lead's contact + current stage, a move-stage
 * control (Select of the pipeline's stages → the move action), a status
 * control, and the full activity timeline (newest first). Stage movement and
 * status changes go through server actions; the api validates + logs a
 * STAGE_CHANGED activity atomically, then the client refreshes this view.
 */
export default async function LeadDetailPage({
    params,
}: {
    params: Promise<{ leadId: string }>;
}) {
    const { leadId } = await params;
    await requireSession();

    const lead = await getLead(leadId);
    if (!lead) notFound();

    const stages = lead.pipeline?.stages ?? [];
    const amount = formatValue(lead.value);
    // Timeline newest-first for reading; the API returns it oldest-first.
    const timeline = [...lead.activities].reverse();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <Link
                href="/leads"
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to leads
            </Link>

            <div className="mb-6 mt-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">{lead.title}</h1>
                    {lead.contact && (
                        <p className="text-sm text-muted-foreground">
                            <Link
                                href={`/contacts/${lead.contact.id}`}
                                className="hover:underline"
                            >
                                {contactName(lead.contact)}
                            </Link>
                            {" · "}
                            {lead.contact.email}
                        </p>
                    )}
                    {amount && <p className="mt-1 text-sm">Value: {amount}</p>}
                </div>
                <div className="flex items-center gap-2">
                    {lead.stage && (
                        <Badge variant="secondary">{lead.stage.name}</Badge>
                    )}
                    <Badge
                        variant={
                            lead.status === "WON"
                                ? "default"
                                : lead.status === "LOST"
                                  ? "destructive"
                                  : "outline"
                        }
                    >
                        {lead.status}
                    </Badge>
                </div>
            </div>

            <div className="mb-8 flex flex-wrap gap-4 rounded-lg border p-4">
                {stages.length > 0 && (
                    <MoveStageControl
                        leadId={lead.id}
                        currentStageId={lead.stageId}
                        stages={stages}
                    />
                )}
                <LeadStatusControl leadId={lead.id} status={lead.status} />
            </div>

            <h2 className="mb-3 text-lg font-semibold">Activity</h2>
            {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No activity yet.
                </p>
            ) : (
                <ol className="space-y-3">
                    {timeline.map((entry) => (
                        <li
                            key={entry.id}
                            className="flex gap-3 border-l-2 border-muted pl-4"
                        >
                            <div>
                                <p className="text-sm font-medium">
                                    {activityLabel(entry.type)}
                                </p>
                                {entry.body && (
                                    <p className="text-sm text-muted-foreground">
                                        {entry.body}
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    {new Date(entry.createdAt).toLocaleString()}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </main>
    );
}
