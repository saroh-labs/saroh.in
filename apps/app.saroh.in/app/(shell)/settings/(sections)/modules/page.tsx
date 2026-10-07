import { ModuleCatalog } from "@/components/modules/module-catalog";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { readMyEmailSetup } from "@/lib/communications/email-setup-service";
import { listModules } from "@/lib/modules/service";
import { connectLocksOf } from "@/lib/providers/connect-lock";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Modules (ADR-003 / #115). Lets OWNER/ADMIN enable the capabilities
 * their business needs and see each module's effective state; other roles see
 * it read-only. Server component — fetches effective availability once from
 * api.saroh.in (which enforces the role) and hands it to the catalog.
 */
export const metadata = { title: "Modules" };

export default async function ModulesSettingsPage() {
    await requireSession();
    // The plan, best-effort: what it won't let the business connect is said
    // on the row up front, not after a key form (UX-006).
    // Email's is the email setup's own answer (DEC-091), as Providers reads.
    const [modules, access, emailSetup] = await Promise.all([
        listModules(),
        billingAccessOrNull(),
        readMyEmailSetup().catch(() => null),
    ]);
    // `canManage` is the API's answer for this person, the same on every row.
    const canManage = modules.some((m) => m.canManage);

    return (
        <SettingsPanel
            width="default"
            header={
                <SettingsPanelHeader
                    title="Modules"
                    description="Turn on what you use. Turning one off hides it — nothing is deleted."
                    readOnlyNote={
                        canManage || modules.length === 0
                            ? undefined
                            : "Only owners and admins can change this."
                    }
                />
            }
        >
            <ModuleCatalog
                modules={modules}
                locks={connectLocksOf(access, emailSetup)}
            />
        </SettingsPanel>
    );
}
