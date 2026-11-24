"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import { closeDataRequest } from "./data-requests";

/**
 * Close a customer's removal request without removing their details
 * (DEC-172, #1107). `customer:remove` and the reason's length are the
 * API's to enforce. As the tab's business (`writeAsOrg`, DEC-259): the
 * screen reads Customers again itself.
 */
export async function closeDataRequestAction(
    requestId: string,
    reason: string,
    orgId: string,
) {
    return writeAsOrg(orgId, () => closeDataRequest(requestId, reason.trim()));
}
