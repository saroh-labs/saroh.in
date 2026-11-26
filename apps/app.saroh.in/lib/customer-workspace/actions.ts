"use server";

import { writeAsOrg, writeAsOrgIfSent } from "@/lib/api/assert-active-org";
import { revalidatePath } from "next/cache";

import { setConsent } from "@/lib/messages/service";

import type { AttentionInput, SuggestionInput } from "./attention";
import type { MergeBody, MergeColumn, MergePreviews } from "./merge";
import { keptColumn } from "./merge";
import type {
    AddCustomerInput,
    AddCustomerResult,
    NoteInput,
    WorkspaceResult,
} from "./service";
import {
    addCustomer,
    confirmAttention,
    createAttention,
    createNote,
    deleteNote,
    getMergePreview,
    getUnlinkPreview,
    linkCustomer,
    markThreadRead,
    mergeContacts,
    removeAttention,
    replyToThread,
    unlinkAccount,
    updateAttention,
    updateDetails,
} from "./service";

/**
 * Server actions for Customer Detail (#120, U18). Each forwards the session
 * to api.saroh.in, which enforces the role and the organization.
 *
 * On React Query (DEC-259): each write on a customer's page or the list
 * takes the tab's business last (`orgId`, from `useCustomerSave`) and goes
 * through `writeAsOrg`, which refuses a moved tab and revalidates nothing;
 * the screen reads its own queries again.
 */
/** Add customer (DEC-056, C14): a contact only; the list shows them. */
export async function addCustomerAction(
    input: AddCustomerInput,
    /** The tab's business (DEC-259): a moved tab is refused. */
    orgId?: string,
): Promise<AddCustomerResult> {
    const result = await writeAsOrgIfSent(orgId, () => addCustomer(input));
    if (result.ok) revalidatePath("/commerce/customers");
    return result;
}

export async function linkCustomerAction(
    contactId: string,
    customerId: string,
    orgId: string,
): Promise<WorkspaceResult> {
    return writeAsOrg(orgId, () => linkCustomer(contactId, customerId));
}

/** The edit sheet's Save, and its Undo (C8). */
export async function saveDetailsAction(
    contactId: string,
    input: Record<string, string>,
    orgId: string,
) {
    return writeAsOrg(orgId, () => updateDetails(contactId, input));
}

export async function addNoteAction(
    contactId: string,
    input: NoteInput,
    orgId: string,
) {
    return writeAsOrg(orgId, () => createNote(contactId, input));
}

export async function deleteNoteAction(
    contactId: string,
    noteId: string,
    orgId: string,
) {
    return writeAsOrg(orgId, () => deleteNote(contactId, noteId));
}

/** Needs attention (C5): add an entry. */
export async function addAttentionAction(
    contactId: string,
    input: AttentionInput,
    orgId: string,
) {
    return writeAsOrg(orgId, () => createAttention(contactId, input));
}

export async function updateAttentionAction(
    contactId: string,
    entryId: string,
    input: AttentionInput,
    orgId: string,
) {
    return writeAsOrg(orgId, () => updateAttention(contactId, entryId, input));
}

/** A booking-page note, added to Needs attention (C12). */
export async function confirmAttentionAction(
    contactId: string,
    entryId: string,
    input: SuggestionInput,
    orgId: string,
) {
    return writeAsOrg(orgId, () => confirmAttention(contactId, entryId, input));
}

/**
 * Sent when the Undo window closes, never before. On a booking-page note
 * it is "Nothing to add".
 */
export async function removeAttentionAction(
    contactId: string,
    entryId: string,
    orgId: string,
) {
    return writeAsOrg(orgId, () => removeAttention(contactId, entryId));
}

/**
 * "They asked to stop": offers by email are revoked — the one consent
 * change a merchant records for a customer. Only the customer says yes.
 */
export async function stopOffersAction(contactId: string, orgId: string) {
    return writeAsOrg(orgId, () =>
        setConsent({ contactId, channel: "EMAIL", status: "REVOKED" }),
    );
}

/**
 * Undo of "They asked to stop" — only offered when the customer had said
 * yes, so this puts back their own answer and never invents one.
 */
export async function restoreOffersAction(contactId: string, orgId: string) {
    return writeAsOrg(orgId, () =>
        setConsent({ contactId, channel: "EMAIL", status: "GRANTED" }),
    );
}

/** What "This isn't them" would move, read when its confirm opens (A4). */
export async function unlinkPreviewAction(contactId: string) {
    return getUnlinkPreview(contactId);
}

/**
 * "This isn't them": the site account moves to a record of its own. Both
 * customers' pages change, so both are read again.
 */
export async function unlinkAccountAction(contactId: string, orgId: string) {
    return writeAsOrg(orgId, () => unlinkAccount(contactId));
}

/**
 * What merging `otherId` with this customer would do (C10), read both
 * ways — first keeping the record the API offers (the older, default 22),
 * then keeping the other — so the dialog can switch which one stays
 * without waiting.
 */
export async function mergePreviewAction(
    contactId: string,
    otherId: string,
): Promise<
    | { ok: true; data: MergePreviews; offered: MergeColumn }
    | { ok: false; error: string }
> {
    const offered = await getMergePreview(contactId, otherId);
    if (!offered.ok) return offered;
    const keep = keptColumn(offered.data, contactId);
    const rest = await getMergePreview(
        contactId,
        otherId,
        keep === "here" ? otherId : contactId,
    );
    if (!rest.ok) return rest;
    return {
        ok: true,
        offered: keep,
        data:
            keep === "here"
                ? { here: offered.data, there: rest.data }
                : { here: rest.data, there: offered.data },
    };
}

/**
 * Merge the two (C10). Both pages change — the one kept gains the other's
 * history and the other's address now leads to it — so both are read again.
 */
export async function mergeAction(
    contactId: string,
    otherId: string,
    body: MergeBody,
    orgId: string,
) {
    return writeAsOrg(orgId, () => mergeContacts(contactId, otherId, body));
}

/** Messages opened (A13): the page reads itself again, clearing the dot. */
export async function markThreadReadAction(contactId: string, orgId: string) {
    return writeAsOrg(orgId, () => markThreadRead(contactId));
}

/**
 * Answer the customer in their thread (A13). `orgId`: from Home on React
 * Query (DEC-259), which reads itself again.
 */
export async function replyAction(
    contactId: string,
    text: string,
    orgId?: string,
) {
    // Every caller is a React Query screen, which reads itself again.
    if (!orgId) return replyToThread(contactId, text);
    return writeAsOrg(orgId, () => replyToThread(contactId, text));
}
