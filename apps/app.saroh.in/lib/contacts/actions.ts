"use server";

import type { UpdateContactInput } from "./service";
import {
    deleteContact as deleteContactApi,
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
