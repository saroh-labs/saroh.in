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

    return (
        <SettingsPanel
            width="default"
            header={
                <SettingsPanelHeader
                    title="Modules"
                    description="Each module adds a section to the rail. Turning one off hides it; nothing is deleted."
                />
            }
        >
            <ModuleCatalog modules={modules} />
        </SettingsPanel>
    );
}
