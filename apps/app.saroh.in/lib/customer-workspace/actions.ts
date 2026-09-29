"use server";

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
 * to api.saroh.in, which enforces the role and the organization, and
 * revalidates the page so what changed is read again.
 */
/** Add customer (DEC-056, C14): a contact only; the list shows them. */
export async function addCustomerAction(
    input: AddCustomerInput,
): Promise<AddCustomerResult> {
    const result = await addCustomer(input);
    if (result.ok) revalidatePath("/commerce/customers");
    return result;
}

export async function linkCustomerAction(
    contactId: string,
    customerId: string,
): Promise<WorkspaceResult> {
    const result = await linkCustomer(contactId, customerId);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

/** The edit sheet's Save, and its Undo (C8). */
export async function saveDetailsAction(
    contactId: string,
    input: Record<string, string>,
) {
    const result = await updateDetails(contactId, input);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

export async function addNoteAction(contactId: string, input: NoteInput) {
    const result = await createNote(contactId, input);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

export async function deleteNoteAction(contactId: string, noteId: string) {
    const result = await deleteNote(contactId, noteId);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

/** Needs attention (C5): add an entry. */
export async function addAttentionAction(
    contactId: string,
    input: AttentionInput,
) {
    const result = await createAttention(contactId, input);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

export async function updateAttentionAction(
    contactId: string,
    entryId: string,
    input: AttentionInput,
) {
    const result = await updateAttention(contactId, entryId, input);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

/** A booking-page note, added to Needs attention (C12). */
export async function confirmAttentionAction(
    contactId: string,
    entryId: string,
    input: SuggestionInput,
) {
    const result = await confirmAttention(contactId, entryId, input);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

/**
 * Sent when the Undo window closes, never before. On a booking-page note
 * it is "Nothing to add".
 */
export async function removeAttentionAction(
    contactId: string,
    entryId: string,
) {
    const result = await removeAttention(contactId, entryId);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

/**
 * "They asked to stop": offers by email are revoked — the one consent
 * change a merchant records for a customer. Only the customer says yes.
 */
export async function stopOffersAction(contactId: string) {
    const result = await setConsent({
        contactId,
        channel: "EMAIL",
        status: "REVOKED",
    });
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

/**
 * Undo of "They asked to stop" — only offered when the customer had said
 * yes, so this puts back their own answer and never invents one.
 */
export async function restoreOffersAction(contactId: string) {
    const result = await setConsent({
        contactId,
        channel: "EMAIL",
        status: "GRANTED",
    });
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}

/** What "This isn't them" would move, read when its confirm opens (A4). */
export async function unlinkPreviewAction(contactId: string) {
    return getUnlinkPreview(contactId);
}

/**
 * "This isn't them": the site account moves to a record of its own. Both
 * customers' pages change, so both are read again.
 */
export async function unlinkAccountAction(contactId: string) {
    const result = await unlinkAccount(contactId);
    if (result.ok) {
        revalidatePath(`/customers/${contactId}`);
        revalidatePath(`/customers/${result.data.contactId}`);
    }
    return result;
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
) {
    const result = await mergeContacts(contactId, otherId, body);
    if (result.ok) {
        revalidatePath(`/customers/${contactId}`);
        revalidatePath(`/customers/${otherId}`);
    }
    return result;
}

/** Messages opened (A13): nothing is re-read, the tab clears its own dot. */
export async function markThreadReadAction(contactId: string) {
    return markThreadRead(contactId);
}

/** Answer the customer in their thread (A13). */
export async function replyAction(contactId: string, text: string) {
    const result = await replyToThread(contactId, text);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}
