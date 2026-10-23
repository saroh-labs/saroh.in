"use server";

import { revalidatePath } from "next/cache";

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
export async function setCustomerEmail(change: { kind: string; on: boolean }) {
    const res = await setCustomerEmailApi(change);
    if (res.ok) revalidatePath("/settings/providers");
    return res;
}

/** When overdue reminders go (DEC-178, #1169). Thin, as the switch is. */
export async function setOverdueTiming(timing: OverdueTiming) {
    const res = await setOverdueTimingApi(timing);
    if (res.ok) revalidatePath("/settings/providers");
    return res;
}
