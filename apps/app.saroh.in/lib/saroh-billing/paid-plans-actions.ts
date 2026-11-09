"use server";

import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * "Tell me when" on the Free note (KTD8). The API takes the address from
 * the session, never from here, so nothing is sent but the ask.
 */
export async function tellMeWhenPaidPlans(): Promise<{ ok: boolean }> {
    const base = await orgBase();
    if (!base) return { ok: false };
    const res = await apiFetch(`${base}/paid-plans-interest`, {
        method: "POST",
    });
    return { ok: res.ok };
}
