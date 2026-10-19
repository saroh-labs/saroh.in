"use server";

import { revalidatePath } from "next/cache";

import { personHref } from "@/lib/contacts/person-href";

import { closeDataRequest } from "./data-requests";

/**
 * Close a customer's removal request without removing their details
 * (DEC-172, #1107). `customer:remove` and the reason's length are the
 * API's to enforce; Customers and the customer's page are read again.
 */
export async function closeDataRequestAction(
    requestId: string,
    reason: string,
    contactId: string | null,
) {
    const result = await closeDataRequest(requestId, reason.trim());
    if (result.ok) {
        revalidatePath("/commerce/customers");
        if (contactId) revalidatePath(personHref(contactId));
    }
    return result;
}
