import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CrmResult } from "@/lib/api/http";
import { apiFetch, destroy, mutate, orgBase } from "@/lib/api/http";

import type { AttentionEntry, AttentionInput } from "./attention";
import type { UnlinkPreview } from "./site-account";

/**
 * Unified customer workspace data access (#120). Server-only. The workspace
 * *connects* a person's CRM + commerce records without merging them; links are
 * explicit and reversible, and only exact email/phone produce a suggestion.
 */
export type TimelineEventType =
    "LEAD" | "BOOKING" | "ORDER" | "MESSAGE" | "LINK";

export interface TimelineEvent {
    type: TimelineEventType;
    at: string;
    title: string;
    moduleKey: string;
}

/**
 * A store customer to link. The API also suggests other contacts to merge
 * (`?include=contacts`, C2); this screen doesn't ask for them yet.
 */
export interface IdentitySuggestion {
    kind: "customer";
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
    const data: unknown = await res.json().catch(() => null);
    return {
        ok: false,
        error: toFailure(data, "Could not link customer.").error,
    };
}

/** What "This isn't them" would move (A4), for its confirm. */
export async function getUnlinkPreview(
    contactId: string,
): Promise<CrmResult<UnlinkPreview>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(
        `${base}/customers/${encodeURIComponent(contactId)}/account/unlink`,
    );
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as UnlinkPreview };
    return toFailure(data, "Couldn't check what would move.");
}

/** "This isn't them": the site account leaves this customer (A4). */
export function unlinkAccount(
    contactId: string,
): Promise<CrmResult<{ contactId: string }>> {
    return mutate<{ contactId: string }>(
        `/customers/${encodeURIComponent(contactId)}/account/unlink`,
        "POST",
        {},
        "Couldn't separate them.",
    );
}

export interface NoteInput {
    body: string;
    allergenIds: string[];
}

/** Write a note about a customer; the API checks each allergen id. */
export function createNote(
    contactId: string,
    input: NoteInput,
): Promise<CrmResult<{ id: string }>> {
    return mutate<{ id: string }>(
        `/customers/${encodeURIComponent(contactId)}/notes`,
        "POST",
        input,
        "Could not add the note.",
    );
}

export function deleteNote(
    contactId: string,
    noteId: string,
): Promise<CrmResult<{ ok: true }>> {
    return destroy<{ ok: true }>(
        `/customers/${encodeURIComponent(contactId)}/notes/${encodeURIComponent(noteId)}`,
        "Could not delete the note.",
    );
}

const attentionPath = (contactId: string, entryId?: string) =>
    `/customers/${encodeURIComponent(contactId)}/attention` +
    (entryId ? `/${encodeURIComponent(entryId)}` : "");

/**
 * Add or change a Needs attention entry (C1). A refusal keeps the field it is
 * about, so the sheet can put it there.
 */
async function writeAttention(
    path: string,
    method: "POST" | "PATCH",
    input: AttentionInput,
): Promise<ApiResult<AttentionEntry>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        body: JSON.stringify(input),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as AttentionEntry };
    return toFailure(
        body,
        method === "POST"
            ? "Could not add that to Needs attention."
            : "Could not save that change.",
    );
}

export function createAttention(contactId: string, input: AttentionInput) {
    return writeAttention(attentionPath(contactId), "POST", input);
}

export function updateAttention(
    contactId: string,
    entryId: string,
    input: AttentionInput,
) {
    return writeAttention(attentionPath(contactId, entryId), "PATCH", input);
}

/** Take an entry off the list; the API keeps the row, stamped removed. */
export function removeAttention(
    contactId: string,
    entryId: string,
): Promise<CrmResult<{ ok: true }>> {
    return destroy<{ ok: true }>(
        attentionPath(contactId, entryId),
        "Could not take that off Needs attention.",
    );
}
