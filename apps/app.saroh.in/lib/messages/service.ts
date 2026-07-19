import type { CrmResult } from "@/lib/crm/http";
import { apiFetch, mutate, orgBase } from "@/lib/crm/http";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";

/**
 * Communications data access for app.saroh.in (S6-002). Org-scoped compose /
 * history / consent for a lead's contact, reached only through the S6-001
 * communications API on api.saroh.in — the app never touches the DB. Server
 * reads (`listLeadMessages`, `listContactConsents`) forward the session cookie +
 * active-org header via the shared CRM plumbing; the api enforces `message:read`
 * / `consent:read`. Mutations (`sendMessage`, `setConsent`) return a
 * {@link CrmResult} and are enforced as `message:write` / `consent:write`.
 *
 * Server-only: the underlying HTTP plumbing imports next/headers. Client
 * components import the pure channel constant + types from `./constants`.
 */

export type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";

/** One provider send attempt for a Message, with its current delivery state. */
export interface MessageDelivery {
    id: string;
    provider: string;
    providerMessageId: string | null;
    /** QUEUED | SENT | DELIVERED | FAILED | BOUNCED */
    status: string;
    error: string | null;
    attempts: number;
    createdAt: string;
    updatedAt: string;
}

/** A message linked to the lead, plus its delivery attempts (asc by created). */
export interface LeadMessage {
    id: string;
    channel: MessageChannel;
    contactId: string | null;
    leadId: string | null;
    toAddress: string;
    subject: string | null;
    body: string;
    /** QUEUED | SENT | FAILED | SUPPRESSED */
    status: string;
    createdAt: string;
    updatedAt: string;
    deliveries: MessageDelivery[];
}

/** A contact's stored opt-in/out for a channel. */
export interface ContactConsent {
    id: string;
    contactId: string;
    channel: MessageChannel;
    status: ConsentStatus;
    source: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SendMessageInput {
    leadId: string;
    channel: MessageChannel;
    contactId?: string;
    subject?: string;
    body: string;
}

export interface SetConsentInput {
    contactId: string;
    channel: MessageChannel;
    status: ConsentStatus;
}

/** The message id + its (possibly SUPPRESSED) status after queueing. */
export interface SendMessageResult {
    id: string;
    status: string;
    channel: string;
}

/**
 * The lead's messages (newest first) + each message's deliveries. Empty on any
 * failure so the detail page still renders.
 */
export async function listLeadMessages(leadId: string): Promise<LeadMessage[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(
        `${base}/messages?leadId=${encodeURIComponent(leadId)}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as LeadMessage[];
}

/**
 * A contact's consents across channels. Empty on any failure (absence of a row
 * means "allowed" — the send gate only blocks on an explicit REVOKED).
 */
export async function listContactConsents(
    contactId: string,
): Promise<ContactConsent[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(
        `${base}/consents?contactId=${encodeURIComponent(contactId)}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as ContactConsent[];
}

/** Queue an outbound message on a channel, linked to the lead. `message:write`. */
export function sendMessage(
    input: SendMessageInput,
): Promise<CrmResult<SendMessageResult>> {
    const { leadId, channel, contactId, subject, body } = input;
    return mutate<SendMessageResult>(
        "/messages",
        "POST",
        {
            leadId,
            channel,
            ...(contactId ? { contactId } : {}),
            ...(subject ? { subject } : {}),
            body,
        },
        "Could not send the message",
    );
}

/** Grant/revoke a contact's consent for a channel. `consent:write`. */
export function setConsent(
    input: SetConsentInput,
): Promise<CrmResult<ContactConsent>> {
    return mutate<ContactConsent>(
        "/consents",
        "POST",
        { ...input, source: "crm-ui" },
        "Could not update consent",
    );
}
