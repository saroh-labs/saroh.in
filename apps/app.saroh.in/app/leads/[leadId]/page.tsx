import { Badge } from "@saroh/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityComposer } from "@/components/crm/activity-composer";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ConsentToggle } from "@/components/crm/consent-toggle";
import { LeadStatusControl } from "@/components/crm/lead-status-control";
import { MessageComposer } from "@/components/crm/message-composer";
import { MessageHistory } from "@/components/crm/message-history";
import { MoveStageControl } from "@/components/crm/move-stage-control";
import { TaskForm } from "@/components/crm/task-form";
import { contactName, formatValue } from "@/lib/crm/format";
import { getLead } from "@/lib/leads/service";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/service";
import { listContactConsents, listLeadMessages } from "@/lib/messages/service";
import { requireSession } from "@/lib/session";

/**
 * Lead detail (S3-005 + S3-007): the lead's contact + current stage, a
 * move-stage control, a status control, a note composer + follow-up task form,
 * and the full activity timeline (newest first). Stage movement, notes, and
 * follow-up tasks all go through server actions; the api validates + logs the
 * matching Activity, then the client refreshes this view so the timeline stays
 * in sync.
 *
 * S6-002 adds messaging: a channel-aware message composer, a consent /
 * unsubscribe control for the contact, and a message history panel showing each
 * message's CURRENT delivery state (delivery is async — the api queues it and a
 * worker drives it to a terminal state, so the panel reflects live status,
 * never a faked SENT). A REVOKED consent makes the composer warn and the send
 * gate SUPPRESS.
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

    // Communications (S6-002): message history (newest first) + this contact's
    // per-channel consent. Messages need no contact; consent is contact-scoped.
    const contactId = lead.contact?.id ?? null;
    const [messages, consents] = await Promise.all([
        listLeadMessages(lead.id),
        contactId ? listContactConsents(contactId) : Promise.resolve([]),
    ]);
    const consentByChannel = consents.reduce<
        Partial<Record<MessageChannel, ConsentStatus>>
    >((acc, c) => {
        acc[c.channel] = c.status;
        return acc;
    }, {});

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

            <div className="mb-8 grid gap-4 rounded-lg border p-4">
                <div className="grid gap-2">
                    <h2 className="text-sm font-medium">Send a message</h2>
                    {contactId ? (
                        <MessageComposer
                            leadId={lead.id}
                            contactId={contactId}
                            consent={consentByChannel}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Link a contact to this lead to send a message.
                        </p>
                    )}
                </div>
                {contactId && (
                    <div className="grid gap-2 border-t pt-4">
                        <h2 className="text-sm font-medium">
                            Consent &amp; unsubscribe
                        </h2>
                        <ConsentToggle
                            contactId={contactId}
                            consent={consentByChannel}
                        />
                    </div>
                )}
            </div>

            <h2 className="mb-3 text-lg font-semibold">Messages</h2>
            <div className="mb-8">
                <MessageHistory messages={messages} />
            </div>

            <h2 className="mb-3 text-lg font-semibold">Activity</h2>
            <ActivityTimeline leadId={lead.id} activities={timeline} />
        </main>
    );
}
