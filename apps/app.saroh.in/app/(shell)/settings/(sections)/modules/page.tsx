import { ModuleCatalog } from "@/components/modules/module-catalog";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { listModules } from "@/lib/modules/service";
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
    const modules = await listModules();
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
            <ModuleCatalog modules={modules} />
        </SettingsPanel>
    );
}
