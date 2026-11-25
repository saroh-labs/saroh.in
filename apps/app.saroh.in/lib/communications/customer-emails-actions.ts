"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { OverdueTiming } from "./customer-emails";
import {
    setCustomerEmail as setCustomerEmailApi,
    setOverdueTiming as setOverdueTimingApi,
} from "./customer-emails-service";

/**
 * Turn one of the business's automatic customer emails on or off. Thin:
 * the API decides who may (`comms:manage`), which kinds are offered, and
 * reads the switch before every send.
 */
export async function setCustomerEmail(
    change: { kind: string; on: boolean },
    orgId?: string,
) {
    // From Integrations on React Query: the tab's business, and the answer
    // goes into its cache (nothing revalidated).
    if (orgId) return writeAsOrg(orgId, () => setCustomerEmailApi(change));
    const res = await setCustomerEmailApi(change);
    if (res.ok) revalidatePath("/settings/integrations");
    return res;
}

/** When overdue reminders go (DEC-178, #1169). Thin, as the switch is. */
export async function setOverdueTiming(timing: OverdueTiming, orgId?: string) {
    if (orgId) return writeAsOrg(orgId, () => setOverdueTimingApi(timing));
    const res = await setOverdueTimingApi(timing);
    if (res.ok) revalidatePath("/settings/integrations");
    return res;
}
