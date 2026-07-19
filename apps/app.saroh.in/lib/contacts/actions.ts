"use server";

import type { UpdateContactInput } from "./service";
import { updateContact as updateContactApi } from "./service";

/**
 * Server Actions for CRM Contact mutations (S3-005). Thin wrappers that forward
 * the session cookie + active-org header to api.saroh.in (via the service); the
 * api resolves the caller from the session and enforces `contact:write`. Client
 * components call these — never the api or the database directly.
 */

export async function updateContact(
    contactId: string,
    input: UpdateContactInput,
) {
    return updateContactApi(contactId, input);
}
