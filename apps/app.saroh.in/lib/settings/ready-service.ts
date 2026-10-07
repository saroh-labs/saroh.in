import { accessRow } from "@/lib/billing/access";
import type { EmailMay } from "@/lib/communications/email-setup";
import { readEmailSetup } from "@/lib/communications/email-setup-service";
import { listModules } from "@/lib/modules/service";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import { listCommsProviders } from "@/lib/providers/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

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
    const [modules, onlineUpgrade] = await Promise.all([
        listModules().catch(() => null),
        onlinePaymentsUpgrade(settings),
    ]);
    return readyChecklist({ settings, modules, onlineUpgrade });
}

/**
 * The plan that takes payment online, for a plan without it (DEC-092): the
 * catalogue's `payments` row names it. Read only then, and best-effort —
 * unread, the checklist says "a paid plan" instead of a name.
 */
async function onlinePaymentsUpgrade(settings: OrganizationSettings) {
    if (settings.setup?.onlinePaymentsInPlan !== false) return null;
    const view = await billingAccessOrNull();
    return accessRow(view, "payments")?.upgradeTo ?? null;
}

/**
 * Settings › Business's card: the same steps, then what Settings also asks
 * for (`nudges.ts`, DEC-056). The messaging providers are read only for
 * someone who may manage them (`comms:manage`) — a refusal there would turn
 * the page into a denial — and, like the modules, best-effort.
 */
export async function loadSettingsChecklist(
    settings: OrganizationSettings,
    may: EmailMay,
): Promise<ReadyChecklist> {
    const [modules, messaging, onlineUpgrade, emailSetup] = await Promise.all([
        listModules().catch(() => null),
        may.connect
            ? listCommsProviders().catch(() => null)
            : Promise.resolve(null),
        onlinePaymentsUpgrade(settings),
        // Whether the plan can connect one (DEC-091): never a Connect the
        // API would refuse. Best-effort; unread asks as before.
        readEmailSetup(may),
    ]);
    return settingsChecklist({
        settings,
        modules,
        messaging,
        onlineUpgrade,
        emailSetup,
        mayPlans: may.plans,
    });
}
