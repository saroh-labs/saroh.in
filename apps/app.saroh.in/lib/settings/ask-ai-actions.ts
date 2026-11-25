"use server";

import type { AskAiSettings } from "@saroh/api-contract";
import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import type { ApiFailure } from "@/lib/api/failure";
import type { CrmResult } from "@/lib/api/http";
import { setAskAiOn } from "@/lib/ask-ai/service";

/**
 * Settings › Ask AI's switch (Owner and Admin; the API checks
 * `module:manage`). The header's Ask AI button reads it, so the whole
 * layout is refreshed. From the React Query tab the business comes last
 * (`writeAsOrg`) and the shell's read is told instead (`afterSettingsSave`).
 */
export async function saveAskAiOn(
    on: boolean,
    orgId?: string,
): Promise<CrmResult<AskAiSettings> | ApiFailure> {
    if (orgId) return writeAsOrg(orgId, () => setAskAiOn(on));
    const result = await setAskAiOn(on);
    // rq-revalidate-ok: only when called without the tab's business (outside React Query).
    if (result.ok) revalidatePath("/", "layout");
    return result;
}
