import { formatStatus } from "@/lib/format/status";
import type { Invitation, Member, MemberRole } from "@/lib/members/service";
import type { Organization } from "@/lib/organizations/service";

/**
 * A location's People tab: who may work on its catalogue, orders and
 * customers, and the invitations out to it. One roster underneath (DEC-048,
 * F16): everyone here is also on the business's Team, and someone invited
 * here joins it as Location team unless they're on it already. Their
 * location role is a narrower grant on top, and is what the catalogue's
 * write rules check.
 *
 * Pure, so the rules are tested without a screen.
 */

/** The roles someone can be invited as, or changed to. */
export const LOCATION_ROLES: readonly MemberRole[] = [
    "ADMIN",
    "MANAGER",
    "EDITOR",
    "VIEWER",
];

/** A role in words: "Viewer", not "VIEWER". */
export const roleLabel = (role: string) => formatStatus(role);

/** What everyone at a location gets, whatever their role there (DEC-074). */
export const EVERYONE_HERE =
    "see its products and orders, and move its orders along";

/**
 * What a location role adds, in one line, as the app now offers it (UX
 * audit, 10 Oct 2026): the API's own answer for that role, read from the
 * location (`lib/stores/abilities.ts`). An Admin, a Manager and an Editor
 * get the same today, and the line says so rather than hint at a
 * difference. Never payments or refunds, which follow the team role's
 * permissions (DEC-106).
 */
export function roleLine(role: string): string {
    return role === "VIEWER"
        ? "Sees this location's products and orders and moves its orders along. Changes nothing else."
        : "Also takes new orders here, to be paid on collection, and changes the location's name and description. Never payments or refunds. Admin, Manager and Editor do the same today.";
}

/** The People tab's line: what being at this location means, by role. */
export function peopleNote(locationName: string): string {
    return `Who can see ${locationName}'s products and orders, and move its orders along. An Admin, Manager or Editor can also take orders here and change its name and description. Everyone here is also on your team, under Team.`;
}

/** What the tab draws: the roster, and what this person may do with it. */
export interface LocationPeople {
    members: Member[];
    invitations: Invitation[];
    /** May change a role, remove someone and see the invitations. */
    canManage: boolean;
    /** May invite here, which also adds someone to the team. */
    canInvite: boolean;
}

/**
 * What the person reading may do with the roster. Managing is the
 * location's owner's. Inviting here also adds someone to the team, so it
 * needs the team's invite too; the API refuses it without. From what the
 * API resolved, falling back to the role's name for a response without
 * permissions.
 */
export function peopleAccess(
    members: readonly Member[],
    userId: string,
    organization: Pick<Organization, "actions" | "role"> | null,
): Pick<LocationPeople, "canManage" | "canInvite"> {
    const canManage = members.some(
        (m) => m.kind === "owner" && m.userId === userId,
    );
    const mayInviteToTeam = organization?.actions
        ? organization.actions.includes("member:invite")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    return { canManage, canInvite: canManage && Boolean(mayInviteToTeam) };
}

/** Their name, or their email when they have given none. */
export function personName(member: Pick<Member, "name" | "email">): string {
    const name = member.name?.trim();
    if (name) return name;
    return member.email;
}

/** The invitations the reader is shown: only someone who may manage. */
export function shownInvitations(people: LocationPeople): Invitation[] {
    return people.canManage ? people.invitations : [];
}

/**
 * Nobody but its owner works here, and nobody has been invited: the tab
 * says so and offers the invite, rather than a list of one.
 */
export function onlyOwnerHere(people: LocationPeople): boolean {
    return (
        people.members.length > 0 &&
        people.members.every((m) => m.kind === "owner") &&
        shownInvitations(people).length === 0
    );
}

/**
 * The line under "No one else works here yet": who owns it, and for someone
 * who may invite, what an invitation is for.
 */
export function onlyOwnerWords(
    people: LocationPeople,
    locationName: string,
): string {
    const owners = people.members
        .filter((m) => m.kind === "owner")
        .map((m) => {
            const name = personName(m);
            return name === m.email ? name : `${name} (${m.email})`;
        });
    const who =
        owners.length <= 1
            ? `${owners.join("")} owns ${locationName}.`
            : `${owners.slice(0, -1).join(", ")} and ${owners.at(-1)} own ${locationName}.`;
    return people.canInvite
        ? `${who} Invite someone to ${EVERYONE_HERE}. With a role above Viewer they can take orders here too.`
        : who;
}
