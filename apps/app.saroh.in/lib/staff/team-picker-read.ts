"use server";

import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";

import { listStaff } from "./service";
import type { StaffView } from "./types";

/**
 * Our team's picker (round 3): the active team, and whether this person
 * may choose who appears (an owner or admin, `service:write`). Only what
 * the screens draw; the API refuses the save on its own. `team` is null
 * when it can't be read.
 */
export async function readTeamForPicker(): Promise<{
    team: StaffView[] | null;
    canChoose: boolean;
}> {
    const [list, organization] = await Promise.all([
        listStaff().catch(() => null),
        activeOrganizationOnce().catch(() => null),
    ]);
    return {
        team: list ? list.staff.filter((p) => p.status === "ACTIVE") : null,
        canChoose: permits(organization, "service:write"),
    };
}
