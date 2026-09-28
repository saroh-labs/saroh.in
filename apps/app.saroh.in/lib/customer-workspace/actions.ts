"use server";

import { revalidatePath } from "next/cache";

import { setConsent } from "@/lib/messages/service";

import type { AttentionInput, SuggestionInput } from "./attention";
import type { NoteInput, WorkspaceResult } from "./service";
import {
    confirmAttention,
    createAttention,
    createNote,
    deleteNote,
    getUnlinkPreview,
    linkCustomer,
    removeAttention,
    unlinkAccount,
    updateAttention,
    updateDetails,
} from "./service";

/**
 * Server actions for Customer Detail (#120, U18). Each forwards the session
 * to api.saroh.in, which enforces the role and the organization, and
 * revalidates the page so what changed is read again.
 */
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
