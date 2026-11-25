import { PermissionDeniedState } from "@saroh/ui/data-state";

import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Your data (owner, 9 Oct, DEC-120): an owner downloads
 * everything the business keeps in Saroh as one zip, whenever they like —
 * and from the closing banner while the business is scheduled for deletion.
 *
 * The owner's alone, by role, as the API has it: the tab is offered only to
 * an owner (`SETTINGS_PAGES`), and anyone else who types the address is
 * told who can, before anything is read.
 *
 * On React Query (DEC-259): the downloads load in the browser
 * (`/api/settings/data`), drawn by `SettingsTabScreen`, which switches to
 * the other Settings tabs in place.
 */
export const metadata = { title: "Your data · Settings" };

export default async function DataPage() {
    await requireSession();
    const org = await activeOrganizationOnce();
    if (org && org.role !== "OWNER") {
        return (
            <SettingsPanel
                header={
                    <SettingsPanelHeader
                        holdsData={false}
                        title="Your data"
                        description="Everything this business keeps in Saroh is yours to take away, whenever you like."
                    />
                }
            >
                <PermissionDeniedState
                    {...whoCanChange({
                        thing: "the business's data",
                        ownerOnly: true,
                    })}
                />
            </SettingsPanel>
        );
    }
    return <SettingsTabScreen tab="/settings/data" kind={org?.kind ?? null} />;
}
