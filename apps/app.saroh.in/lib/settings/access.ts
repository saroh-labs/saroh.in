import "server-only";

import { env } from "@/env";
import { accountSettingsUrl } from "@/lib/accounts";
import {
    accessRow,
    rowLimit,
    rowNotice,
    upgradeHref,
} from "@/lib/billing/access";
import { pausedTeam, teamOverLimit } from "@/lib/billing/paused";
import { mayChangePlan } from "@/lib/billing/plan-access";
import { readCalendarMembers } from "@/lib/google-calendar/service";
import { calendarByUser } from "@/lib/google-calendar/team";
import type { CalendarMember } from "@/lib/google-calendar/types";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { getAlertPreferences } from "@/lib/notifications/service";
import { diaryPeopleToInvite } from "@/lib/organizations/calendar-only";
import { shownCatalogue } from "@/lib/organizations/catalogue-shown";
import { bookableWithNoLogin } from "@/lib/organizations/invitations";
import { isOnlyOwner } from "@/lib/organizations/leave-business";
import type {
    OrganizationInvitation,
    OrganizationMember,
} from "@/lib/organizations/members";
import {
    getStorefrontTeamNotice,
    listInvitations,
    listMembers,
} from "@/lib/organizations/members";
import { permits } from "@/lib/organizations/permits";
import { getRoleCatalogue, listRoles } from "@/lib/organizations/roles";
import { rolesLock } from "@/lib/organizations/roles-lock";
import type { Organization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { getOrganizationSettings } from "@/lib/organizations/settings-service";
import { readWebAddress } from "@/lib/organizations/web-address-service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull, pausedOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { loadSettingsChecklist } from "@/lib/settings/ready-service";
import { listSites } from "@/lib/sites/service";
import { listStaff, readMyStaff } from "@/lib/staff/service";
import { listStorefrontHours } from "@/lib/stores/storefronts";
import { usageSharingOrNull } from "@/lib/usage-sharing/service";
import { replaySwitchedOn, sharesUsageNow } from "@/lib/usage-sharing/sharing";

import type {
    NoAsk,
    OrganizationScreen,
    PeopleScreen,
    ProfileScreen,
} from "./queries";
import { organizationRead, peopleRead, profileRead } from "./queries";

/**
 * Settings' reads on the server (DEC-259): what `/api/settings/*` answer
 * with, behind each tab's own gate. What the
 * pages decided before (who may manage, change roles, edit) is decided
 * here, so a tab drawn from the cache shows each role what it did.
 */

/**
 * From what the API resolved this person may do; without permissions (an
 * older response) the built-in Owner and Admin decide, as the pages did.
 */
function mayFor(
    org: Pick<Organization, "role" | "actions"> | null,
): (action: string) => boolean {
    return (action) =>
        org?.actions
            ? org.actions.includes(action)
            : org?.role === "OWNER" || org?.role === "ADMIN";
}

/** Team: whoever may open it (`member:read`), as the tab list decides. */
export async function mayReadPeople(): Promise<boolean> {
    const org = await activeOrganizationOnce();
    return !!org && (org.role === "OWNER" || mayFor(org)("member:read"));
}

/** Your profile: everyone in the business. */
export async function mayReadProfile(): Promise<boolean> {
    return !!(await activeOrganizationOnce());
}

/** Business: owners and admins (`org:settings:read`). */
export async function mayReadOrganization(): Promise<boolean> {
    const org = await activeOrganizationOnce();
    return !!org && mayFor(org)("org:settings:read");
}

/**
 * A person as Team draws them, field by field: whatever else the API might
 * one day send never reaches the browser or the dehydrated state.
 */
export function memberFacts(m: OrganizationMember): OrganizationMember {
    return {
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
        roleKey: m.roleKey,
        siteIds: m.siteIds,
        isSelf: m.isSelf,
        lastActiveAt: m.lastActiveAt,
        storefronts: m.storefronts?.map((s) => ({
            storeId: s.storeId,
            name: s.name,
            role: s.role,
        })),
        extraActions: m.extraActions,
    };
}

/** An open invitation's row: never its token or link (the API sends none). */
export function invitationFacts(
    i: OrganizationInvitation,
): OrganizationInvitation {
    return {
        id: i.id,
        email: i.email,
        role: i.role,
        roleKey: i.roleKey,
        siteIds: i.siteIds,
        status: i.status,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
        staff: i.staff ? { id: i.staff.id, name: i.staff.name } : i.staff,
        countedOnDiary: i.countedOnDiary,
    };
}

/** A Google Calendar connection as the column draws it: the address, never a credential. */
function calendarFacts(c: CalendarMember): CalendarMember {
    return {
        membershipId: c.membershipId,
        staffId: c.staffId,
        name: c.name,
        accounts: c.accounts.map((a) => ({
            id: a.id,
            googleEmail: a.googleEmail,
            state: a.state,
        })),
        bookingsGoToGoogle: c.bookingsGoToGoogle,
        pausedBecause: c.pausedBecause,
    };
}

export const peopleServer: ServerRead<NoAsk, PeopleScreen> = {
    read: peopleRead,
    service: async () => {
        const organization = await activeOrganizationOnce();
        const may = mayFor(organization);
        const canManage = may("member:invite");
        const canEditRoles = may("member:role:update");
        const [
            members,
            invitations,
            sites,
            roles,
            fullCatalogue,
            joinedFromStorefronts,
            modules,
            staff,
            paused,
        ] = await Promise.all([
            listMembers(),
            // Empty for anyone who may not see them: a member still gets the roster.
            canManage ? listInvitations() : Promise.resolve([]),
            // Only to name the sites a reviewer can be invited to.
            canManage ? listSites() : Promise.resolve([]),
            listRoles(),
            // `null` renders as "could not be loaded", never as no powers.
            getRoleCatalogue().catch(() => null),
            // The storefront people the F16 backfill added (DEC-048).
            canEditRoles ? getStorefrontTeamNotice() : Promise.resolve([]),
            // To leave out a hidden module's permissions (DEC-073).
            modulesOrUnknown(),
            // Who takes bookings with no login: a team seat each (DEC-111).
            canManage ? listStaff().catch(() => null) : Promise.resolve(null),
            // Past the plan's team limit (#800): who is paused, and why.
            pausedOrNull(),
        ]);
        // Who has connected Google Calendar (DEC-233), for whoever may change roles.
        const calendarMembers = canEditRoles
            ? await readCalendarMembers()
            : null;
        // The plan, for whoever changes the team or its roles.
        const access =
            canManage || canEditRoles ? await billingAccessOrNull() : null;
        // The plan's team seats (U14, DEC-155); a soft cap never stops an invite.
        const team = canManage ? rowLimit(access, "members") : null;
        const seats = team?.on && !team.soft ? team : null;
        const pausedPeople = pausedTeam(paused);
        const staffProfiles: PeopleScreen["staffProfiles"] = {};
        if (may("service:write")) {
            for (const p of staff?.staff ?? []) {
                if (p.membership) {
                    staffProfiles[p.membership.userId] = {
                        staffId: p.id,
                        photo: p.photo?.url ?? null,
                        about: p.about ?? null,
                    };
                }
            }
        }
        // Over the limit (#800) the paused notes say it; the notice would
        // say it a third time.
        const notice =
            canManage && !teamOverLimit(pausedPeople)
                ? rowNotice(access, "members")
                : null;
        return {
            organizationName: organization?.name ?? "this business",
            members: members.map(memberFacts),
            invitations: invitations.map(invitationFacts),
            sites: sites.map((s) => ({ id: s.id, name: s.name })),
            canManage,
            canEditRoles,
            roles,
            catalogue: shownCatalogue(fullCatalogue, modules),
            myActions: organization?.actions ?? null,
            joinedFromStorefronts,
            teamLimit: seats ? { full: seats.full, why: seats.why } : null,
            bookableNoLogin: bookableWithNoLogin(staff?.staff ?? null),
            // Who of them can be given a login, as Calendar only (#868).
            diaryPeople: diaryPeopleToInvite(staff?.staff ?? null, invitations),
            rolesLock: canEditRoles ? rolesLock(access) : null,
            staffProfiles,
            paused: pausedPeople,
            calendar: calendarMembers
                ? {
                      byUser: calendarByUser(
                          calendarMembers.map(calendarFacts),
                          staff?.staff ?? null,
                      ),
                      canDisconnect: true,
                  }
                : null,
            limitNotice: notice?.on
                ? {
                      ...notice,
                      href:
                          notice.href ??
                          upgradeHref(
                              accessRow(access, "members")?.upgradeTo?.planId,
                          ),
                  }
                : null,
        };
    },
};

export const profileServer: ServerRead<NoAsk, ProfileScreen> = {
    read: profileRead,
    service: async () => {
        const { user } = await requireSession();
        const recordingOn = replaySwitchedOn({
            key: env.NEXT_PUBLIC_POSTHOG_KEY,
            replay: env.NEXT_PUBLIC_POSTHOG_REPLAY,
            analytics: env.NEXT_PUBLIC_POSTHOG_ANALYTICS,
        });
        const [alerts, org, usageSharing, myStaff] = await Promise.all([
            getAlertPreferences(),
            activeOrganizationOnce(),
            recordingOn ? usageSharingOrNull() : null,
            // Your place on the diary, for your photo (null when not on it).
            readMyStaff(),
        ]);
        // An owner always reads the roster; anyone else only with the
        // permission: a refused read would turn this tab into a denial.
        const mayReadTeam =
            org !== null &&
            (org.role === "OWNER" || permits(org, "member:read"));
        const roster = mayReadTeam
            ? await listMembers().catch(() => null)
            : null;
        const me = roster?.find((m) => m.isSelf);
        return {
            name: user.name?.trim() ?? "",
            email: user.email,
            accountUrl: accountSettingsUrl,
            alerts,
            mine: myStaff
                ? {
                      staffId: myStaff.id,
                      photo: myStaff.photo?.url ?? null,
                      about: myStaff.about ?? null,
                  }
                : null,
            leave: org
                ? {
                      business: org.name,
                      onlyOwner: isOnlyOwner(roster) === true,
                      locations: (me?.storefronts ?? []).map((s) => s.name),
                  }
                : null,
            sharesUsage: usageSharing
                ? sharesUsageNow(usageSharing)
                : undefined,
        };
    },
};

export const organizationServer: ServerRead<NoAsk, OrganizationScreen> = {
    read: organizationRead,
    service: async () => {
        // The Hours tab and the web address are reads of their own: one
        // that fails is said on its card, never the whole tab.
        const [settings, organization, hours, webAddress] = await Promise.all([
            getOrganizationSettings(),
            activeOrganizationOnce(),
            listStorefrontHours(),
            readWebAddress(),
        ]);
        const may = mayFor(organization);
        const canEdit = may("org:update");
        // Home's "Finish setup" steps, and what Settings adds (DEC-056).
        const ready =
            settings && canEdit
                ? await loadSettingsChecklist(settings, {
                      connect: may("comms:manage"),
                      plans: may("billing:read"),
                  })
                : null;
        return {
            settings,
            kind: organization?.kind ?? null,
            canEdit,
            canEditHours: may("store:write"),
            hours,
            webAddress,
            ready,
            businessId: organization?.id ?? null,
            canChangePlan: mayChangePlan(organization),
        };
    },
};
