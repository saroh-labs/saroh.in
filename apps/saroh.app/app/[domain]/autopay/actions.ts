"use server";

import type { AutopayDoneState } from "@saroh/site-blocks";

import type { AutopayRead } from "@/lib/autopay-read";
import { autopayNow } from "@/lib/autopay-read";
import { siteOrigin } from "@/lib/origin";

/**
 * How autopay stands, asked again by the page a customer lands on after
 * setting it up (round-2 D12) while it is being confirmed. Checks `Origin`
 * first, as every action here does.
 */
export async function readAutopay(
    read: AutopayRead,
): Promise<AutopayDoneState> {
    if (!(await siteOrigin())) return { kind: "error" };
    return autopayNow(read);
}
