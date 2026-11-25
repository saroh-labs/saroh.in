"use client";

import { formatMoney } from "@/lib/format/money";
import { Badge } from "@saroh/ui/badge";
import { IntentLink } from "@saroh/ui/intent-link";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ConsentToggle } from "@/components/crm/consent-toggle";
import { EnquiryCard } from "@/components/crm/enquiry-card";
import { LeadActions } from "@/components/crm/lead-actions";
import { LeadStatusControl } from "@/components/crm/lead-status-control";
import { MessageHistory } from "@/components/crm/message-history";
import { MoveStageControl } from "@/components/crm/move-stage-control";
import { DeleteLeadMenu } from "@/components/leads/delete-lead-menu";
import { EditLeadDialog } from "@/components/leads/edit-lead-dialog";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/components/shared/states/who-can-change";
import { personHref } from "@/lib/contacts/person-href";
import { contactName, LEAD_STATUS } from "@/lib/crm/format";
import type { LeadAsk } from "@/lib/leads/queries";
import { useLead } from "@/lib/leads/use-leads";
import type { ComposerGate } from "@/lib/messages/composer-gate";
import type { MessageChannel } from "@/lib/messages/constants";
import { ReadFailed } from "@/lib/query/client";

/**
 * A lead's page on React Query (DEC-259): the same header, controls,
 * messages, timeline and consent, from one query (`/api/leads/[leadId]`)
 * that an edit, a move, a note, a follow-up, a message or a consent change
 * reads again (`useLeadsSave`). What the role may do and what each channel
 * can send come from the page. Its title, badges and actions all come from
 * the lead, so the route's loader (`skeleton`) stands until it lands; no
 * such lead here is the not-found page.
 */
export function LeadDetailContainer({
    ask,
    canWrite,
    canLog,
    canMessage,
    canConsent,
    currency,
    gates,
    skeleton,
}: {
    ask: LeadAsk;
    /** The route's loader, until the lead is read. */
    skeleton: ReactNode;
    /** `lead:write`: edit, delete, move its stage and its status. */
    canWrite: boolean;
    /** `activity:write`: a note, a follow-up, marking one done. */
    canLog: boolean;
    /** `message:write`. */
    canMessage: boolean;
    /** `consent:write`. */
    canConsent: boolean;
    currency: string;
    gates: Record<MessageChannel, ComposerGate>;
}) {
    const read = useLead(ask);
    const view = read.data;
    if (read.isError && !view) {
        // Missing, or another business's: the route's 404.
        if (read.error instanceof ReadFailed && read.error.status === 404) {
            notFound();
        }
        // Any other failure is the page failing (`error.tsx`).
        throw read.error;
    }
    if (!view) return skeleton;
    const { lead, messages, consent: consentByChannel } = view;
    const contactId = lead.contact?.id ?? null;

    const stages = lead.pipeline?.stages ?? [];
    const amount = formatMoney(lead.value, currency, { decimals: "always" });
    // Timeline newest-first for reading; the API returns it oldest-first.
    const timeline = [...lead.activities].reverse();

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={[
                    <IntentLink data-ph-unmask="" key="leads" href="/leads">
                        Leads
                    </IntentLink>,
                    lead.title,
                ]}
                holdsData
                title={lead.title}
                description={
                    lead.contact ? (
                        <>
                            <IntentLink
                                href={personHref(lead.contact.id)}
                                className="hover:underline"
                            >
                                {contactName(lead.contact)}
                            </IntentLink>
                            {" · "}
                            {lead.contact.email}
                            {amount ? ` · Worth: ${amount}` : ""}
                        </>
                    ) : amount ? (
                        `Worth: ${amount}`
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
                        {canWrite ? (
                            <>
                                <EditLeadDialog
                                    leadId={lead.id}
                                    title={lead.title}
                                    value={lead.value}
                                    currency={currency}
                                />
                                <DeleteLeadMenu
                                    leadId={lead.id}
                                    title={lead.title}
                                    contactName={
                                        lead.contact
                                            ? contactName(lead.contact)
                                            : null
                                    }
                                />
                            </>
                        ) : null}
                    </>
                }
            />

            {canWrite ? null : (
                <ReadOnlyNote>{readOnlyLine("this lead")}</ReadOnlyNote>
            )}

            <LeadActions
                leadId={lead.id}
                contactId={contactId}
                consent={consentByChannel}
                gates={gates}
                canLog={canLog}
                canMessage={canMessage}
            />

            {lead.enquiries && lead.enquiries.length > 0 ? (
                <div className="mb-8">
                    <EnquiryCard
                        enquiries={lead.enquiries}
                        knownEmail={lead.contact?.email ?? null}
                    />
                </div>
            ) : null}

            {/* Its stage and status are the badges in the header for
                someone who can't move them. */}
            {canWrite ? (
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
            ) : null}

            <h2 data-ph-unmask="" className="mb-3 text-lg font-semibold">
                Messages
            </h2>
            <div className="mb-8">
                <MessageHistory messages={messages} />
            </div>

            <h2 data-ph-unmask="" className="mb-3 text-lg font-semibold">
                Activity
            </h2>
            <div className="mb-8">
                <ActivityTimeline
                    leadId={lead.id}
                    activities={timeline}
                    canWrite={canLog}
                />
            </div>

            {/* Communications off: nothing can be sent or consented to
                here, so there is no consent to show. */}
            {contactId && gates.EMAIL.kind !== "off" ? (
                <div className="grid gap-2 rounded-lg border p-4">
                    <h2 data-ph-unmask="" className="text-sm font-medium">
                        Consent and unsubscribe
                    </h2>
                    <ConsentToggle
                        contactId={contactId}
                        consent={consentByChannel}
                        canWrite={canConsent}
                    />
                </div>
            ) : null}
        </PageContainer>
    );
}
