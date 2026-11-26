"use server";

import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";

import { listStaff } from "./service";
import type { StaffView } from "./types";

/**
 * A person as the team pickers draw them: never their email, login, hours
 * or services. `membership` says only that they sign in, and as what.
 */
export type TeamPickPerson = Pick<
    StaffView,
    "id" | "name" | "title" | "status" | "showOnTeamPage" | "photo"
> & { membership: { role?: string } | null };

/**
 * Our team's picker (round 3): the active team, and whether this person
 * may choose who appears (an owner or admin, `service:write`). Only what
 * the screens draw; the API refuses the save on its own. `team` is null
 * when it can't be read.
 */
export async function readTeamForPicker(): Promise<{
    team: TeamPickPerson[] | null;
    canChoose: boolean;
}> {
    const [list, organization] = await Promise.all([
        listStaff().catch(() => null),
        activeOrganizationOnce().catch(() => null),
    ]);
    return {
        team: list
            ? list.staff
                  .filter((p) => p.status === "ACTIVE")
                  .map((p) => ({
                      id: p.id,
                      name: p.name,
                      title: p.title,
                      status: p.status,
                      showOnTeamPage: p.showOnTeamPage,
                      photo: p.photo
                          ? { id: p.photo.id, url: p.photo.url }
                          : null,
                      membership: p.membership
                          ? { role: p.membership.role }
                          : null,
                  }))
            : null,
        canChoose: permits(organization, "service:write"),
    };
}
