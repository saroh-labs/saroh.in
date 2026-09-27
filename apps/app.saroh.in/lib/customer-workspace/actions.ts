"use server";

import { revalidatePath } from "next/cache";

import { setConsent } from "@/lib/messages/service";

import type { NoteInput, WorkspaceResult } from "./service";
import {
    createNote,
    deleteNote,
    getUnlinkPreview,
    linkCustomer,
    unlinkAccount,
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
