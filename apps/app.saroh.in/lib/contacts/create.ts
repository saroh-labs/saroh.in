"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { CreateContactInput } from "./service";
import { createContact as createContactApi } from "./service";

/**
 * Server Action: add a contact by hand; the API enforces `contact:write`.
 * With the tab's business (DEC-259) it is refused when another business
 * was opened since (`writeAsOrg`); nothing is revalidated, the screen reads
 * its queries again.
 */
export async function createContact(input: CreateContactInput, orgId?: string) {
    return orgId
        ? writeAsOrg(orgId, () => createContactApi(input))
        : createContactApi(input);
}
