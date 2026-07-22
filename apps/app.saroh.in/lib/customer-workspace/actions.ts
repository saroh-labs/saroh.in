"use server";

import { revalidatePath } from "next/cache";

import type { WorkspaceResult } from "./service";
import { linkCustomer } from "./service";

/**
 * Server action to confirm a customer identity link (#120). Forwards the
 * session to api.saroh.in (which enforces role + Organization scoping) and
 * revalidates the workspace so the timeline picks up the newly connected
 * commerce history.
 */
export async function linkCustomerAction(
    contactId: string,
    customerId: string,
): Promise<WorkspaceResult> {
    const result = await linkCustomer(contactId, customerId);
    if (result.ok) revalidatePath(`/customers/${contactId}`);
    return result;
}
