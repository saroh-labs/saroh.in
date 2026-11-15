"use server";

import type { AskAiSettings } from "@saroh/api-contract";
import { revalidatePath } from "next/cache";

import type { CrmResult } from "@/lib/api/http";
import { setAskAiOn } from "@/lib/ask-ai/service";

/**
 * Settings › Ask AI's switch (Owner and Admin; the API checks
 * `module:manage`). The header's Ask AI button reads it, so the whole
 * layout is refreshed.
 */
export async function saveAskAiOn(
    on: boolean,
): Promise<CrmResult<AskAiSettings>> {
    const result = await setAskAiOn(on);
    if (result.ok) revalidatePath("/", "layout");
    return result;
}
