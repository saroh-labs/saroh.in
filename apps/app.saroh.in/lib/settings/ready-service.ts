import { listModules } from "@/lib/modules/service";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import type { ReadyChecklist } from "./ready";
import { readyChecklist } from "./ready";

/**
 * The take-money checklist as Home and Settings › Business both read it, so
 * the two show the same steps and the same count for the same business (F8).
 *
 * Call it only for someone who may change the business (`org:update`): the
 * steps are theirs to do, and the settings behind it are owner and admin
 * reads. The modules read is best-effort — when it fails, the steps it
 * answers are left out rather than counted either way.
 */
export async function loadReadyChecklist(
    settings: OrganizationSettings,
): Promise<ReadyChecklist> {
    const modules = await listModules().catch(() => null);
    return readyChecklist({ settings, modules });
}
