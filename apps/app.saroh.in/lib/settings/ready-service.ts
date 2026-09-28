import { listModules } from "@/lib/modules/service";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import { listCommsProviders } from "@/lib/providers/service";

import { settingsChecklist } from "./nudges";
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

/**
 * Settings › Business's card: the same steps, then what Settings also asks
 * for (`nudges.ts`, DEC-056). The messaging providers are read only for
 * someone who may manage them (`comms:manage`) — a refusal there would turn
 * the page into a denial — and, like the modules, best-effort.
 */
export async function loadSettingsChecklist(
    settings: OrganizationSettings,
    mayMessaging: boolean,
): Promise<ReadyChecklist> {
    const [modules, messaging] = await Promise.all([
        listModules().catch(() => null),
        mayMessaging
            ? listCommsProviders().catch(() => null)
            : Promise.resolve(null),
    ]);
    return settingsChecklist({ settings, modules, messaging });
}
