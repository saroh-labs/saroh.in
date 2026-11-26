"use server";

import type { AskAiSettings } from "@saroh/api-contract";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import type { ApiFailure } from "@/lib/api/failure";
import type { CrmResult } from "@/lib/api/http";
import { setAskAiOn } from "@/lib/ask-ai/service";

/**
 * Settings › Ask AI's switch (Owner and Admin; the API checks
 * `module:manage`). The header's Ask AI button reads it: the tab (on React
 * Query) passes its business last (`writeAsOrg`) and tells the shell's
 * read itself (`afterSettingsSave`); nothing is revalidated.
 */
export async function saveAskAiOn(
    on: boolean,
    orgId?: string,
): Promise<CrmResult<AskAiSettings> | ApiFailure> {
    return orgId ? writeAsOrg(orgId, () => setAskAiOn(on)) : setAskAiOn(on);
}
