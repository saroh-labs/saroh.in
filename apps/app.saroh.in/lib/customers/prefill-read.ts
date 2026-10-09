import { unstable_rethrow } from "next/navigation";

import { getCustomerDetail } from "@/lib/customer-workspace/detail";
import { isMergedRedirect } from "@/lib/customer-workspace/merge";

import type { CustomerPick } from "./picker";
import { pickFromPerson } from "./prefill";

/**
 * The person New order or New booking opens for (#247), read the way their
 * page reads them (`contact:read`, any module). Server-only. Null — the
 * picker then starts empty — for no one, a record merged away, details
 * removed, or a read that failed: the flow still opens, and the merchant
 * picks as before.
 */
export async function readCustomerPick(
    contactId: string | null,
): Promise<CustomerPick | null> {
    if (!contactId) return null;
    try {
        const detail = await getCustomerDetail(contactId);
        if (!detail || isMergedRedirect(detail)) return null;
        return pickFromPerson(detail);
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}
