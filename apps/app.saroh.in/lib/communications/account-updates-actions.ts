"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import { setAccountUpdates as setAccountUpdatesApi } from "./account-updates-service";

/**
 * Turn "Updates in Messages" on or off. Thin: the API decides who may
 * (`comms:manage`) and reads the choice before every post.
 */
export async function setAccountUpdates(on: boolean, orgId?: string) {
    // From Integrations on React Query: the tab's business, nothing revalidated.
    if (orgId) return writeAsOrg(orgId, () => setAccountUpdatesApi(on));
    const res = await setAccountUpdatesApi(on);
    if (res.ok) revalidatePath("/settings/integrations");
    return res;
}
