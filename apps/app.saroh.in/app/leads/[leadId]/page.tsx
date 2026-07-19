import { Badge } from "@saroh/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityComposer } from "@/components/crm/activity-composer";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LeadStatusControl } from "@/components/crm/lead-status-control";
import { MoveStageControl } from "@/components/crm/move-stage-control";
import { TaskForm } from "@/components/crm/task-form";
import { contactName, formatValue } from "@/lib/crm/format";
import { getLead } from "@/lib/leads/service";
import { requireSession } from "@/lib/session";

/**
 * Lead detail (S3-005 + S3-007): the lead's contact + current stage, a
 * move-stage control, a status control, a note composer + follow-up task form,
 * and the full activity timeline (newest first). Stage movement, notes, and
 * follow-up tasks all go through server actions; the api validates + logs the
 * matching Activity, then the client refreshes this view so the timeline stays
 * in sync.
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

            <div className="mb-8 grid gap-4 rounded-lg border p-4">
                <div className="grid gap-2">
                    <h2 className="text-sm font-medium">Add a note</h2>
                    <ActivityComposer leadId={lead.id} />
                </div>
                <div className="grid gap-2 border-t pt-4">
                    <h2 className="text-sm font-medium">
                        Schedule a follow-up
                    </h2>
                    <TaskForm leadId={lead.id} />
                </div>
            </div>

            <h2 className="mb-3 text-lg font-semibold">Activity</h2>
            <ActivityTimeline leadId={lead.id} activities={timeline} />
        </main>
    );
}
