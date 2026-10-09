"use server";

import { revalidatePath } from "next/cache";

import type { UpdateContactInput } from "./service";
import {
    deleteContact as deleteContactApi,
    getRemovalPreview,
    removeDetails,
    updateContact as updateContactApi,
} from "./service";

/**
 * Server Actions for contacts. A thin wrapper that forwards the session and
 * active organization to api.saroh.in, which enforces `contact:write`.
 */
export async function updateContact(
    contactId: string,
    input: UpdateContactInput,
) {
    return updateContactApi(contactId, input);
}

export async function deleteContact(contactId: string) {
    return deleteContactApi(contactId);
}

/** What a privacy removal would do (C11), for its dialog. */
export async function removalPreviewAction(contactId: string) {
    return getRemovalPreview(contactId);
}

/**
 * Remove their details for a privacy request (C11). `customer:remove` is
 * enforced by the API. The lists that showed them are read again.
 */
export async function removeDetailsAction(contactId: string) {
    const result = await removeDetails(contactId);
    if (result.ok) {
        revalidatePath(`/contacts/${contactId}`);
        revalidatePath("/commerce/customers");
        revalidatePath("/contacts");
    }
    return result;
}
