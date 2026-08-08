import { apiFetch, orgBase, readError } from "@/lib/api/http";

/**
 * Unified customer workspace data access (#120). Server-only. The workspace
 * *connects* a person's CRM + commerce records without merging them; links are
 * explicit and reversible, and only exact email/phone produce a suggestion.
 */
export type TimelineEventType = "LEAD" | "BOOKING" | "ORDER" | "MESSAGE";

export interface TimelineEvent {
    type: TimelineEventType;
    at: string;
    title: string;
    moduleKey: string;
}

export interface IdentitySuggestion {
    customerId: string;
    name: string;
    email: string;
    matchedOn: ("email" | "phone")[];
}

export type WorkspaceResult = { ok: true } | { ok: false; error: string };

export async function getTimeline(contactId: string): Promise<TimelineEvent[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(
        `${base}/customers/${encodeURIComponent(contactId)}/timeline`,
    );
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GET timeline failed: ${res.status}`);
    return ((await res.json()) as { events: TimelineEvent[] }).events;
}

export async function getSuggestions(
    contactId: string,
): Promise<IdentitySuggestion[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(
        `${base}/customers/${encodeURIComponent(contactId)}/suggestions`,
    );
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GET suggestions failed: ${res.status}`);
    return (await res.json()) as IdentitySuggestion[];
}

export async function linkCustomer(
    contactId: string,
    customerId: string,
): Promise<WorkspaceResult> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(
        `${base}/customers/${encodeURIComponent(contactId)}/links`,
        { method: "POST", body: JSON.stringify({ customerId }) },
    );
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
    } | null;
    return { ok: false, error: readError(data, "Could not link customer.") };
}
