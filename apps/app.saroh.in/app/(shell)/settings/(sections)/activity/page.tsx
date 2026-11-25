import { PermissionDeniedState } from "@saroh/ui/data-state";

import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { SettingsTabScreen } from "@/components/settings/settings-tab-screen";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { mayReadActivity } from "@/lib/settings/activity-access";
import { ACTIVITY_SAYS } from "@/lib/settings/queries";

/**
 * Settings → Activity: who changed the business's settings and team, and
 * when — the last 50, newest first, from the audit stream.
 *
 * `audit:read`, Owner and Admin: the design offers it to anyone who reads
 * the settings, but the API refuses a Member, so the tab is offered only to
 * those it answers (`SETTINGS_PAGES`) and this page explains the refusal to
 * anyone who types the address.
 *
 * A row opens the whole change, timed in the business's own zone (#509).
 *
 * On React Query (DEC-259): the changes load in the browser
 * (`/api/settings/activity`), drawn by `SettingsTabScreen`.
 */
export const metadata = { title: "Activity · Settings" };

export default async function ActivityPage() {
    await requireSession();
    const org = await activeOrganizationOnce();
    if (!(await mayReadActivity())) {
        return (
            <SettingsPanel
                header={
                    <SettingsPanelHeader
                        holdsData={false}
                        title="Activity"
                        description={ACTIVITY_SAYS}
                    />
                }
            >
                <PermissionDeniedState
                    {...whoCanChange({ thing: "Activity" })}
                />
            </SettingsPanel>
        );
    }
    return (
        <SettingsTabScreen tab="/settings/activity" kind={org?.kind ?? null} />
    );
}
