"use server";

import { revalidatePath } from "next/cache";

import { setAccountUpdates as setAccountUpdatesApi } from "./account-updates-service";

/**
 * Turn "Updates in Messages" on or off. Thin: the API decides who may
 * (`comms:manage`) and reads the choice before every post.
 */
export async function setAccountUpdates(on: boolean) {
    const res = await setAccountUpdatesApi(on);
    if (res.ok) revalidatePath("/settings/providers");
    return res;
}
