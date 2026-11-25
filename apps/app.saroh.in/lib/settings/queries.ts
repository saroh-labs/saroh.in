import type { ActivityEntry } from "@/components/settings/activity/activity-list";
import type {
    AskAiPeopleUsage,
    AskAiState,
    AskAiUsage,
} from "@saroh/api-contract";
import type { LimitNotice } from "@saroh/pricing-catalog";

import type { PausedTeam } from "@/lib/billing/paused";
import type { CalendarMember } from "@/lib/google-calendar/types";
import type { AlertPreferencesRead } from "@/lib/notifications/preferences";
import type { DiaryPerson } from "@/lib/organizations/calendar-only";
import type { TeamLimit } from "@/lib/organizations/invitations";
import type {
    OrganizationInvitation,
    OrganizationMember,
    StorefrontTeamNoticePerson,
} from "@/lib/organizations/members";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import type { RolesLock } from "@/lib/organizations/roles-lock";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import type { WebAddressRead } from "@/lib/organizations/web-address";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { ReadyChecklist } from "@/lib/settings/ready";
import type { StorefrontHoursRead } from "@/lib/stores/storefronts";

/**
 * Settings' reads (DEC-259): Team, Your profile and Business, one read per
 * tab. Client-safe: the keys and the routes; the services are paired in
 * `access.ts`. Never a token, an invitation's link or a provider
 * credential: each person, invitation and calendar account crosses as the
 * facts its row draws.
 */

/** Every Settings read of a business: what a save there marks stale. */
export const settingsKeys = (orgId: string): DomainKey =>
    domainKey("settings", orgId);

/** Settings › Team: the roster, invitations, roles and what this person may change. */
export interface PeopleScreen {
    organizationName: string;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    sites: { id: string; name: string }[];
    canManage: boolean;
    canEditRoles: boolean;
    roles: Role[];
    catalogue: RoleCatalogue | null;
    myActions: string[] | null;
    joinedFromStorefronts: StorefrontTeamNoticePerson[];
    teamLimit: TeamLimit | null;
    bookableNoLogin: number;
    diaryPeople: DiaryPerson[];
    rolesLock: RolesLock | null;
    staffProfiles: Record<
        string,
        { staffId: string; photo: string | null; about: string | null }
    >;
    paused: PausedTeam;
    calendar: {
        byUser: Record<string, CalendarMember>;
        canDisconnect: boolean;
    } | null;
    /** The plan's team-seats notice (80% / 100%), or null: none shown. */
    limitNotice: (LimitNotice & { on: true; href: string }) | null;
}

/** Settings › Your profile. */
export interface ProfileScreen {
    name: string;
    email: string;
    accountUrl: string;
    alerts: AlertPreferencesRead;
    mine: {
        staffId: string;
        photo: string | null;
        about: string | null;
    } | null;
    leave: { business: string; onlyOwner: boolean; locations: string[] } | null;
    /** Absent where session recording is off, or the choice couldn't be read. */
    sharesUsage?: boolean;
}

/** Settings › Business. */
export interface OrganizationScreen {
    settings: OrganizationSettings | null;
    /** The business list's kind, when the settings read has none. */
    kind: string | null;
    canEdit: boolean;
    canEditHours: boolean;
    hours: StorefrontHoursRead;
    webAddress: WebAddressRead;
    ready: ReadyChecklist | null;
    businessId: string | null;
    canChangePlan: boolean;
}

export const peopleRead = defineRead<PeopleScreen>()({
    key: (orgId) => domainKey("settings", orgId, "people"),
    route: { path: "/api/settings/people", params: {} },
    tier: "settings",
});

export const profileRead = defineRead<ProfileScreen>()({
    key: (orgId) => domainKey("settings", orgId, "profile"),
    route: { path: "/api/settings/profile", params: {} },
    tier: "settings",
});

export const organizationRead = defineRead<OrganizationScreen>()({
    key: (orgId) => domainKey("settings", orgId, "organization"),
    route: { path: "/api/settings/organization", params: {} },
    tier: "settings",
});

export type NoAsk = Parameters<typeof peopleRead.options>[1];

/** The tabs drawn in place from the cache (`SettingsTabScreen`), by address. */
export const IN_PLACE_TABS = [
    "/settings/people",
    "/settings/profile",
    "/settings/organization",
    "/settings/modules",
    "/settings/integrations",
    "/settings/billing",
    "/settings/data",
    "/settings/activity",
] as const;
export type InPlaceTab = (typeof IN_PLACE_TABS)[number];

export function inPlaceTab(pathname: string | null): InPlaceTab | null {
    return IN_PLACE_TABS.find((t) => t === pathname) ?? null;
}

/**
 * Settings › Activity on React Query (DEC-259): the last changes, each as
 * its line and its sheet draw it (worded on the server, in the business's
 * zone), never the audit row itself. `records`: the team adds to it.
 */
/** The tab's line under its title, on the loader and the screen alike. */
export const ACTIVITY_SAYS =
    "The last changes to this business's settings, team and customer records, newest first.";

export interface ActivityScreen {
    entries: ActivityEntry[];
}

export const activityRead = defineRead<ActivityScreen>()({
    key: (orgId) => domainKey("settings", orgId, "activity"),
    route: { path: "/api/settings/activity", params: {} },
    tier: "records",
});

/**
 * Settings › API and AI apps › Ask AI on React Query (DEC-259): the
 * business's switch, this period's total and who asked. Counts only,
 * never what anyone asked.
 */
export interface AskAiScreen {
    state: AskAiState | null;
    /** The period's total, kept while the switch is off. */
    usage: AskAiUsage | null;
    people: AskAiPeopleUsage | null;
}

export const askAiSettingsRead = defineRead<AskAiScreen>()({
    key: (orgId) => domainKey("settings", orgId, "ask-ai"),
    route: { path: "/api/settings/developers/ask-ai", params: {} },
    tier: "settings",
});
