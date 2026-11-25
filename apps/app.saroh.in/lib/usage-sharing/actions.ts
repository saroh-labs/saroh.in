"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import type { CrmResult } from "@/lib/api/http";

import { markUsageNoticeSeen, updateUsageSharing } from "./service";
import type { UsageSharing } from "./sharing";

/**
 * Save "Help improve Saroh" (DEC-125). The API takes the person from the
 * session, never from here. The shell reads the choice before it starts the
 * recorder, so the whole layout is refreshed: the next page already has it.
 * Your profile on React Query passes the tab's business last
 * (`writeAsOrg`); the layout is still revalidated, in this action's own
 * answer, because whether the recorder starts is the server layout's gate.
 */
export async function saveUsageSharing(
    sharesUsage: boolean,
    orgId?: string,
): Promise<CrmResult<UsageSharing>> {
    const result = orgId
        ? await writeAsOrg(orgId, () => updateUsageSharing(sharesUsage))
        : await updateUsageSharing(sharesUsage);
    // rq-revalidate-ok: the shell layout reads the choice to start the recorder.
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
