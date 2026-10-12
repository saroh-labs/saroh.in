import { PermissionDeniedState } from "@saroh/ui/data-state";

import { DataExportPanel } from "@/components/settings/data-export-panel";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { whoCanChange } from "@/components/shared/who-can-change";
import { listDataExports } from "@/lib/data-export/service";
import { dataExportLine } from "@/lib/data-export/words";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Your data (owner, 9 Oct, DEC-120): an owner downloads
 * everything the business keeps in Saroh as one zip, whenever they like —
 * and from the closing banner while the business is scheduled for deletion.
 *
 * The owner's alone, by role, as the API has it: the tab is offered only to
 * an owner (`SETTINGS_PAGES`), and anyone else who types the address is
 * told who can, before anything is read.
 */
export const metadata = { title: "Your data · Settings" };

export default async function DataPage() {
    await requireSession();
    const org = await resolveActiveOrganization();
    const header = (
        <SettingsPanelHeader
            title="Your data"
            description="Everything this business keeps in Saroh is yours to take away, whenever you like."
        />
    );
    if (org && org.role !== "OWNER") {
        return (
            <SettingsPanel header={header}>
                <PermissionDeniedState
                    {...whoCanChange({
                        thing: "the business's data",
                        ownerOnly: true,
                    })}
                />
            </SettingsPanel>
        );
    }
    const read = await listDataExports();
    const now = new Date();
    return (
        <SettingsPanel header={header}>
            <DataExportPanel
                lines={(read?.exports ?? []).map((view) =>
                    dataExportLine(view, now),
                )}
                inProgress={read?.inProgress ?? false}
            />
        </SettingsPanel>
    );
}
