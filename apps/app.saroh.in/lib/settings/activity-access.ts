import "server-only";

import { navCan } from "@/components/shared/navigation/nav-items";
import { ApiError } from "@/lib/api/errors";
import { listRoles } from "@/lib/organizations/roles";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/time-zones";
import type { ServerRead } from "@/lib/query/route";

import { activityLine } from "./activity";
import { activityDetail } from "./activity-detail";
import { listSettingsActivity } from "./activity-service";
import type { ActivityScreen, NoAsk } from "./queries";
import { activityRead } from "./queries";

/** Activity: `audit:read` (Owner and Admin), as the tab list offers it. */
export async function mayReadActivity(): Promise<boolean> {
    const org = await activeOrganizationOnce();
    return (
        !!org &&
        navCan({ role: org.role, actions: org.actions ?? null }, "audit:read")
    );
}

export const activityServer: ServerRead<NoAsk, ActivityScreen> = {
    read: activityRead,
    service: async () => {
        const [read, roles, zone] = await Promise.all([
            listSettingsActivity(),
            // Only to name a role the business invented; the built-ins are
            // known without it, so a failed read costs a word, not the tab.
            listRoles().catch(() => []),
            // Should the zone's read fail, the times say UTC, named beside each.
            getOrganizationSettings().then(
                (settings) => settings?.profile?.timezone ?? DEFAULT_TIMEZONE,
                () => "UTC",
            ),
        ]);
        if (read.status === "denied") throw new ApiError(403, "GET audit");
        const roleLabels = Object.fromEntries(
            roles.map((role) => [role.key, role.label]),
        );
        return {
            entries: read.events.flatMap((event) => {
                const line = activityLine(event, roleLabels);
                return line
                    ? [
                          {
                              line,
                              detail: activityDetail(event, zone, roleLabels),
                          },
                      ]
                    : [];
            }),
        };
    },
};
