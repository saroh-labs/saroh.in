"use server";

import { revalidatePath } from "next/cache";

import type { CrmResult } from "@/lib/api/http";

import { markUsageNoticeSeen, updateUsageSharing } from "./service";
import type { UsageSharing } from "./sharing";

/**
 * Save "Help improve Saroh" (DEC-125). The API takes the person from the
 * session, never from here. The shell reads the choice before it starts the
 * recorder, so the whole layout is refreshed: the next page already has it.
 */
export async function saveUsageSharing(
    sharesUsage: boolean,
): Promise<CrmResult<UsageSharing>> {
    const result = await updateUsageSharing(sharesUsage);
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

/**
 * The one-time notice was dismissed. Kept on the person, so it never comes
 * back on another device or in another business; the layout is refreshed so
 * the next page already leaves it out.
 */
export async function dismissUsageNotice(): Promise<CrmResult<UsageSharing>> {
    const result = await markUsageNoticeSeen();
    if (result.ok) revalidatePath("/", "layout");
    return result;
}
