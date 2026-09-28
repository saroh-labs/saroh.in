import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CrmResult } from "@/lib/api/http";
import { apiFetch, destroy, mutate, orgBase } from "@/lib/api/http";

import type {
    AttentionEntry,
    AttentionInput,
    SuggestionInput,
} from "./attention";
import type { MergeBody, MergePreview, MergeResult } from "./merge";
import type { UnlinkPreview } from "./site-account";

/**
 * Unified customer workspace data access (#120). Server-only. The workspace
 * *connects* a person's CRM + commerce records without merging them; links are
 * explicit and reversible, and only exact email/phone produce a suggestion.
 */
export type TimelineEventType =
    "LEAD" | "BOOKING" | "ORDER" | "MESSAGE" | "LINK" | "MERGE" | "DETAILS";

export interface TimelineEvent {
    type: TimelineEventType;
    at: string;
    title: string;
    moduleKey: string;
}

/** A store customer to link (#120). */
export interface IdentitySuggestion {
    kind: "customer";
    customerId: string;
    name: string;
    email: string;
    matchedOn: ("email" | "phone")[];
}

/** Another contact who is likely the same person (C2): merge them (C10). */
export interface DuplicateSuggestion {
    kind: "contact";
    contactId: string;
    name: string | null;
    /** Never a reserved placeholder. */
    email: string | null;
    matchedOn: ("email" | "phone")[];
    /** They sign in on the business's website. */
    signsIn: boolean;
}

export type Suggestion = IdentitySuggestion | DuplicateSuggestion;

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

/**
 * Store customers to link and, with `includeContacts`, other contacts to
 * merge (`?include=contacts`, C2). Each item says its `kind`.
 */
export async function getSuggestions(
    contactId: string,
    { includeContacts = false }: { includeContacts?: boolean } = {},
): Promise<Suggestion[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(
        `${base}/customers/${encodeURIComponent(contactId)}/suggestions` +
            (includeContacts ? "?include=contacts" : ""),
    );
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GET suggestions failed: ${res.status}`);
    return (await res.json()) as Suggestion[];
}

const mergePath = (contactId: string, otherId: string) =>
    `/customers/${encodeURIComponent(contactId)}/merge/${encodeURIComponent(otherId)}`;

/**
 * What merging `otherId` with this customer would do (C9), keeping
 * `survivorId` — or, left out, the one the API offers: the older record.
 */
export async function getMergePreview(
    contactId: string,
    otherId: string,
    survivorId?: string,
): Promise<CrmResult<MergePreview>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const query = survivorId
        ? `?${new URLSearchParams({ survivorId }).toString()}`
        : "";
    const res = await apiFetch(
        `${base}${mergePath(contactId, otherId)}/preview${query}`,
    );
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as MergePreview };
    return toFailure(data, "Couldn't check what the merge would do.");
}

/** Merge the two into `body.survivorId` (C9). Final. */
export function mergeContacts(
    contactId: string,
    otherId: string,
    body: MergeBody,
): Promise<CrmResult<MergeResult>> {
    return mutate<MergeResult>(
        mergePath(contactId, otherId),
        "POST",
        body,
        "Couldn't merge them. Nothing has changed.",
    );
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

/** Who already holds an email the sheet tried to give (C8's 409). */
export interface EmailHolder {
    contactId: string;
    name: string | null;
}

export type DetailsResult =
    | { ok: true }
    | {
          ok: false;
          error: string;
          field?: string;
          /** Set when another customer holds the email. */
          holder?: EmailHolder;
      };

function holderOf(body: unknown): EmailHolder | undefined {
    const b = (body ?? {}) as { error?: unknown; details?: unknown };
    const inner =
        b.error && typeof b.error === "object"
            ? (b.error as { details?: unknown }).details
            : b.details;
    const d = (inner ?? {}) as { contactId?: unknown; name?: unknown };
    return typeof d.contactId === "string" && d.contactId
        ? {
              contactId: d.contactId,
              name: typeof d.name === "string" ? d.name : null,
          }
        : undefined;
}

/**
 * Save the edit sheet (C8): name, phone, company, email and address, on
 * the contact. A refusal keeps its field, and an email another customer
 * holds names them.
 */
export async function updateDetails(
    contactId: string,
    input: Record<string, string>,
): Promise<DetailsResult> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(
        `${base}/contacts/${encodeURIComponent(contactId)}`,
        { method: "PATCH", body: JSON.stringify(input) },
    );
    if (res.ok) return { ok: true };
    const body: unknown = await res.json().catch(() => null);
    const failure = toFailure(body, "Couldn't save their details.");
    const holder = res.status === 409 ? holderOf(body) : undefined;
    return holder ? { ...failure, holder } : failure;
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

/**
 * "Add to Needs attention" on a booking-page note (C12), with the kind,
 * label and sensitive tick staff settled on. A refusal keeps its field.
 */
export async function confirmAttention(
    contactId: string,
    entryId: string,
    input: SuggestionInput,
): Promise<ApiResult<AttentionEntry>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(
        `${base}${attentionPath(contactId, entryId)}/confirm`,
        { method: "POST", body: JSON.stringify(input) },
    );
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as AttentionEntry };
    return toFailure(body, "Could not add that to Needs attention.");
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
