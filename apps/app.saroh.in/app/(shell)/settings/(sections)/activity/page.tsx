import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";

import { ActivityList } from "@/components/settings/activity-list";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { navCan } from "@/components/shared/nav-items";
import { listRoles } from "@/lib/organizations/roles";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/time-zones";
import { requireSession } from "@/lib/session";
import { activityLine } from "@/lib/settings/activity";
import { activityDetail } from "@/lib/settings/activity-detail";
import { listSettingsActivity } from "@/lib/settings/activity-service";

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
 * That zone is read from the settings; should the read fail, the times say
 * UTC — still true, since the zone is named beside each one.
 */
export const metadata = { title: "Activity" };

const DENIED = (
    <PermissionDeniedState
        title="Activity is kept to owners and admins"
        description="It names who changed what in this business, so it is kept to the roles that manage it."
        note="Ask an owner or admin if you need to know who changed a setting."
    />
);

export default async function ActivityPage() {
    await requireSession();
    const org = await resolveActiveOrganization();
    const header = (
        <SettingsPanelHeader
            title="Activity"
            description="The last changes to this business's settings, newest first."
        />
    );
    const may = navCan(
        { role: org?.role ?? null, actions: org?.actions ?? null },
        "audit:read",
    );
    if (!may) return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;

    const [read, roles, zone] = await Promise.all([
        listSettingsActivity(),
        // Only to name a role the business invented; the built-ins are
        // known without it, so a failed read costs a word, not the page.
        listRoles().catch(() => []),
        getOrganizationSettings().then(
            (settings) => settings?.profile?.timezone ?? DEFAULT_TIMEZONE,
            () => "UTC",
        ),
    ]);
    if (read.status === "denied") {
        return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;
    }
    const roleLabels = Object.fromEntries(
        roles.map((role) => [role.key, role.label]),
    );
    const entries = read.events.flatMap((event) => {
        const line = activityLine(event, roleLabels);
        return line
            ? [{ line, detail: activityDetail(event, zone, roleLabels) }]
            : [];
    });

    return (
        <SettingsPanel header={header}>
            {entries.length === 0 ? (
                <div className="max-w-[760px]">
                    <EmptyState
                        title="No changes yet"
                        description="When someone changes a setting, it shows here."
                    />
                </div>
            ) : (
                <ActivityList entries={entries} />
            )}
        </SettingsPanel>
    );
}
