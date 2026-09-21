"use server";

import type { CreateContactInput } from "./service";
import { createContact as createContactApi } from "./service";

/** Server Action: add a contact by hand; the API enforces `contact:write`. */
export async function createContact(input: CreateContactInput) {
    return createContactApi(input);
}
