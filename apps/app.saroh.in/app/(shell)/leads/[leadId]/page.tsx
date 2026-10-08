import { Badge } from "@saroh/ui/badge";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityComposer } from "@/components/crm/activity-composer";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ComposerNotice } from "@/components/crm/composer-notice";
import { ConsentToggle } from "@/components/crm/consent-toggle";
import { EnquiryCard } from "@/components/crm/enquiry-card";
import { LeadStatusControl } from "@/components/crm/lead-status-control";
import { MessageComposer } from "@/components/crm/message-composer";
import { MessageHistory } from "@/components/crm/message-history";
import { MoveStageControl } from "@/components/crm/move-stage-control";
import { TaskForm } from "@/components/crm/task-form";
import { DeleteLeadMenu } from "@/components/leads/delete-lead-menu";
import { EditLeadDialog } from "@/components/leads/edit-lead-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { personHref } from "@/lib/contacts/person-href";
import { contactName, formatValue, LEAD_STATUS } from "@/lib/crm/format";
import { getLead } from "@/lib/leads/service";
import { composerGate } from "@/lib/messages/composer-gate";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/service";
import { listContactConsents, listLeadMessages } from "@/lib/messages/service";
import { rolledOut } from "@/lib/modules/rollout";
import { listModules } from "@/lib/modules/service";
import { listCommsProviders } from "@/lib/providers/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/** The tab's title (UX-081): without one it read the bare "Saroh". */
export const metadata = { title: "Lead" };

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
 *
 * UX-067: the composer shows only while Communications is on, and a channel
 * with nothing connected to send it says so up front — connect it where the
 * plan has room, or the plan that has it (DEC-086, DEC-091) — rather than
 * letting the owner write into a refusal (`composerGate`). The modules,
 * providers and plan are aids, read best-effort: unread, the composer shows
 * as before.
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
    const [messages, consents, modules] = await Promise.all([
        listLeadMessages(lead.id),
        contactId ? listContactConsents(contactId) : Promise.resolve([]),
        listModules().catch(() => null),
    ]);
    const comms = modules
        ? rolledOut(modules).find((m) => m.key === "COMMUNICATIONS")
        : undefined;
    const communicationsOn = modules ? comms?.lifecycle === "ENABLED" : null;
    // Providers and plan matter only while it is on; a read refused for
    // this role is unknown, never a reason to hide the composer.
    const [providers, access] = communicationsOn
        ? await Promise.all([
              listCommsProviders().catch(() => null),
              billingAccessOrNull(),
          ])
        : [null, null];
    const gateFor = (channel: MessageChannel) =>
        composerGate({
            channel,
            communicationsOn,
            canManageModules: comms?.canManage ?? false,
            providers,
            access,
        });
    const gates = { EMAIL: gateFor("EMAIL"), WHATSAPP: gateFor("WHATSAPP") };
    const consentByChannel = consents.reduce<
        Partial<Record<MessageChannel, ConsentStatus>>
    >((acc, c) => {
        acc[c.channel] = c.status;
        return acc;
    }, {});

    return (
        <PageContainer>
            <PageHeader
                title={lead.title}
                description={
                    lead.contact ? (
                        <>
                            <Link
                                href={personHref(lead.contact.id)}
                                className="hover:underline"
                            >
                                {contactName(lead.contact)}
                            </Link>
                            {" · "}
                            {lead.contact.email}
                            {amount ? ` · Value: ${amount}` : ""}
                        </>
                    ) : amount ? (
                        `Value: ${amount}`
                    ) : undefined
                }
                actions={
                    <>
                        {lead.stage && (
                            <Badge variant="neutral">{lead.stage.name}</Badge>
                        )}
                        <Badge variant={LEAD_STATUS[lead.status].variant}>
                            {LEAD_STATUS[lead.status].label}
                        </Badge>
                        <EditLeadDialog
                            leadId={lead.id}
                            title={lead.title}
                            value={lead.value}
                        />
                        <DeleteLeadMenu
                            leadId={lead.id}
                            title={lead.title}
                            contactName={
                                lead.contact ? contactName(lead.contact) : null
                            }
                        />
                    </>
                }
            />

            {lead.enquiries && lead.enquiries.length > 0 ? (
                <div className="mb-8">
                    <EnquiryCard
                        enquiries={lead.enquiries}
                        knownEmail={lead.contact?.email ?? null}
                    />
                </div>
            ) : null}

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

            {gates.EMAIL.kind === "off" ? (
                // Communications off: nothing can be sent or consented to
                // here. Someone who may turn it on is told where; anyone
                // else sees no composer at all.
                gates.EMAIL.canManage ? (
                    <div className="mb-8 grid gap-2 rounded-lg border p-4">
                        <h2 className="text-sm font-medium">Send a message</h2>
                        <ComposerNotice gate={gates.EMAIL} />
                    </div>
                ) : null
            ) : (
                <div className="mb-8 grid gap-4 rounded-lg border p-4">
                    <div className="grid gap-2">
                        <h2 className="text-sm font-medium">Send a message</h2>
                        {contactId ? (
                            <MessageComposer
                                leadId={lead.id}
                                contactId={contactId}
                                consent={consentByChannel}
                                gates={gates}
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
            )}

            <h2 className="mb-3 text-lg font-semibold">Messages</h2>
            <div className="mb-8">
                <MessageHistory messages={messages} />
            </div>

            <h2 className="mb-3 text-lg font-semibold">Activity</h2>
            <ActivityTimeline leadId={lead.id} activities={timeline} />
        </PageContainer>
    );
}
