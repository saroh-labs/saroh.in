import type { AdminPermission, AdminRole } from "./control-plane";
import { formatDate } from "./format";
import { ROLE_LABEL } from "./roles";
import type { ContactKind, LeadCard } from "./saroh-lead-words";
import { CONTACT_LABEL } from "./saroh-lead-words";
import type { StaffJob } from "./team-words";
import { JOB_LABEL } from "./team-words";

/**
 * A teammate's page in words (DEC-169, admin console U22, R33): the
 * shapes `GET /admin/team/members/:id` sends and what the page says about
 * them. Client-safe, so the tabs and the sheets import it directly. No
 * rate, amount or price is ever written here.
 */

/** How a business came to its manager (`AccountManagerLink.source`). */
export type LinkSource = "LINK" | "CODE" | "LEAD_EMAIL" | "ASSIGNED";
export type LinkKind = "BROUGHT_IN" | "ASSIGNED";
export type StaffEngagement = "FULL_TIME" | "PART_TIME" | "FREELANCE";

export const ENGAGEMENTS: readonly StaffEngagement[] = [
    "FULL_TIME",
    "PART_TIME",
    "FREELANCE",
];

export const ENGAGEMENT_LABEL: Record<StaffEngagement, string> = {
    FULL_TIME: "Full time",
    PART_TIME: "Part time",
    FREELANCE: "Freelance",
};

/** How it came in, short, for a row. */
export const SOURCE_SHORT: Record<LinkSource, string> = {
    LINK: "Their link",
    CODE: "Their code",
    LEAD_EMAIL: "Their lead's email",
    ASSIGNED: "Assigned",
};

/** How it came in, as a sentence's end ("Came in through …"). */
export const SOURCE_LONG: Record<LinkSource, string> = {
    LINK: "signed up through their link",
    CODE: "typed their code at sign-up",
    LEAD_EMAIL: "signed up with the email on their lead",
    ASSIGNED: "was given to them by Saroh's team",
};

export interface MemberProfile {
    platformAdminId: string;
    exists: boolean;
    worksAs: StaffJob | null;
    workEmail: string | null;
    phone: string | null;
    city: string | null;
    languages: string[];
    joinedOn: string | null;
    reportsToPlatformAdminId: string | null;
    engagement: StaffEngagement | null;
    capacity: number | null;
    managerCode: string | null;
    onCommission: boolean;
    emergencyContact: string | null;
    taxIdSet: boolean;
    /** Present only for a `team:pay` reader. */
    taxIdLast4?: string | null;
    updatedAt: string | null;
}

export interface MemberBusiness {
    organizationId: string;
    name: string;
    slug: string;
    source: LinkSource;
    kind: LinkKind;
    since: string;
}

export type MemberActivity =
    | {
          id: string;
          type: "contact";
          at: string;
          kind: ContactKind;
          minutes: number | null;
          summary: string | null;
          with:
              | { type: "lead"; id: string; name: string | null }
              | { type: "business"; id: string; name: string }
              | null;
      }
    | {
          id: string;
          type: "role-given" | "role-ended";
          at: string;
          role: AdminRole;
          expiresAt: string | null;
      }
    | {
          id: string;
          type: "business-started" | "business-ended";
          at: string;
          organizationId: string;
          name: string;
          source: LinkSource;
      };

export interface TeamMember {
    platformAdminId: string;
    userId: string;
    name: string | null;
    email: string;
    grantedAt: string;
    revokedAt: string | null;
    note: string | null;
    self: boolean;
    roles: { role: AdminRole; expiresAt: string | null; assignedAt: string }[];
    profile: MemberProfile;
    reportsTo: { platformAdminId: string; name: string } | null;
    businesses: MemberBusiness[];
    /** Null: this reader doesn't see leads. */
    leads: LeadCard[] | null;
    counts: {
        businesses: number;
        broughtIn: number;
        openLeads: number;
        overdueFollowUps: number;
        wonThisMonth: number;
    };
    activity: MemberActivity[];
}

/** What the reader may do on this page, from their own permissions. */
export interface MemberAccess {
    /** Edit details… (`team:write`). */
    editProfile: boolean;
    /** Earnings and the tax id (`team:pay`). */
    pay: boolean;
    /** Log a call: one's own page, with `saroh-leads:write`. */
    logCall: boolean;
}

export function memberAccessOf(
    member: Pick<TeamMember, "self">,
    permissions: readonly AdminPermission[],
): MemberAccess {
    return {
        editProfile: permissions.includes("team:write"),
        pay: permissions.includes("team:pay"),
        logCall: member.self && permissions.includes("saroh-leads:write"),
    };
}

export function memberName(member: Pick<TeamMember, "name" | "email">) {
    const name = member.name?.trim();
    // An empty name falls back too, which `??` alone would keep.
    return name === undefined || name === "" ? member.email : name;
}

/** The page's tabs, each an address under `/team/<id>`. */
export const MEMBER_TABS = [
    { value: "profile", label: "Profile" },
    { value: "businesses", label: "Businesses" },
    { value: "leads", label: "Leads" },
    { value: "earnings", label: "Earnings" },
    { value: "activity", label: "Activity" },
] as const;
export type MemberTab = (typeof MEMBER_TABS)[number]["value"];

/** The tabs this reader gets: Leads when they see leads, Earnings with `team:pay`. */
export function memberTabsFor(input: {
    seesLeads: boolean;
    pay: boolean;
}): (typeof MEMBER_TABS)[number][] {
    return MEMBER_TABS.filter(
        (tab) =>
            (tab.value !== "leads" || input.seesLeads) &&
            (tab.value !== "earnings" || input.pay),
    );
}

/** Which tab an address is, under the member's own address `base`. */
export function memberTabOf(pathname: string, base: string): MemberTab {
    const rest = pathname.startsWith(base)
        ? pathname.slice(base.length).replace(/^\/+/, "").split("/")[0]
        : "";
    const found = MEMBER_TABS.find((tab) => tab.value === rest);
    return found ? found.value : "profile";
}

export function memberBase(platformAdminId: string): string {
    return `/team/${encodeURIComponent(platformAdminId)}`;
}

/** One line of the Profile: its label, the value in words, or missing. */
export interface ProfileRow {
    key: string;
    label: string;
    value: string | null;
    /** A line under it: who sees it, what it is for. */
    hint?: string;
}

/**
 * The Profile's rows, in order. A value of null is missing and the page
 * marks it. The tax id is a row only for a `team:pay` reader (Platform
 * owner and Billing), and even then never whole: set or its last 4.
 */
export function profileRows(
    member: Pick<TeamMember, "profile" | "reportsTo">,
    pay: boolean,
): ProfileRow[] {
    const p = member.profile;
    const rows: ProfileRow[] = [
        {
            key: "worksAs",
            label: "Works as",
            value: p.worksAs ? JOB_LABEL[p.worksAs] : null,
        },
        {
            key: "workEmail",
            label: "Work email",
            value: p.workEmail,
        },
        {
            key: "phone",
            label: "Phone",
            value: p.phone,
            hint: "Shown to their businesses in Help.",
        },
        { key: "city", label: "City", value: p.city },
        {
            key: "languages",
            label: "Languages",
            value: p.languages.length > 0 ? p.languages.join(", ") : null,
        },
        {
            key: "joinedOn",
            label: "Joined",
            value: p.joinedOn ? formatDate(`${p.joinedOn}T00:00:00`) : null,
        },
        {
            key: "reportsTo",
            label: "Reports to",
            value: member.reportsTo?.name ?? null,
        },
        {
            key: "engagement",
            label: "Working as",
            value: p.engagement ? ENGAGEMENT_LABEL[p.engagement] : null,
        },
        {
            key: "capacity",
            label: "Can look after",
            value:
                p.capacity === null
                    ? null
                    : `${p.capacity} ${p.capacity === 1 ? "business" : "businesses"}`,
        },
        {
            key: "onCommission",
            label: "Paid by commission",
            value: p.exists ? (p.onCommission ? "Yes" : "No") : null,
        },
        {
            key: "emergencyContact",
            label: "Emergency contact",
            value: p.emergencyContact,
        },
    ];
    if (pay) {
        rows.push({
            key: "taxId",
            label: "Tax id (PAN)",
            value: p.taxIdSet
                ? p.taxIdLast4
                    ? `Ends ${p.taxIdLast4}`
                    : "On file"
                : null,
            hint: "Only Platform owner and Billing see this.",
        });
    }
    return rows;
}

/** "2 missing", or null when nothing is. */
export function missingWords(rows: readonly ProfileRow[]): string | null {
    const missing = rows.filter((row) => row.value === null).length;
    return missing === 0 ? null : `${missing} missing`;
}

/** The `?am=` link on the public site that carries their code. */
export function managerLink(siteUrl: string, code: string): string {
    return `${siteUrl.replace(/\/+$/, "")}/?am=${encodeURIComponent(code)}`;
}

/** "Their link · since 3 Oct 2026". */
export function cameInWords(
    business: Pick<MemberBusiness, "source" | "since">,
) {
    return `${SOURCE_SHORT[business.source]} · since ${formatDate(business.since)}`;
}

/** What an Activity entry says: a short headline and a line under it. */
export function activityWords(entry: MemberActivity): {
    what: string;
    line: string | null;
} {
    switch (entry.type) {
        case "contact": {
            const kind = CONTACT_LABEL[entry.kind];
            const who = !entry.with
                ? null
                : entry.with.type === "business"
                  ? entry.with.name
                  : (entry.with.name ?? "A lead");
            const parts = [
                who,
                entry.minutes ? `${entry.minutes} min` : null,
                entry.summary,
            ].filter((part): part is string => Boolean(part));
            return {
                what: `Logged a ${kind.toLowerCase()}`,
                line: parts.length > 0 ? parts.join(" · ") : null,
            };
        }
        case "role-given":
            return {
                what: `Given the ${ROLE_LABEL[entry.role]} role`,
                line: entry.expiresAt
                    ? `Until ${formatDate(entry.expiresAt)}`
                    : null,
            };
        case "role-ended":
            return {
                what: `${ROLE_LABEL[entry.role]} role ended`,
                line: null,
            };
        case "business-started":
            return {
                what: `Started looking after ${entry.name}`,
                line: `It ${SOURCE_LONG[entry.source]}.`,
            };
        case "business-ended":
            return {
                what: `Stopped looking after ${entry.name}`,
                line: null,
            };
    }
}

/** Activity with the entries just logged on this page first, once each. */
export function withLogged(
    activity: readonly MemberActivity[],
    logged: readonly MemberActivity[],
): MemberActivity[] {
    const seen = new Set(activity.map((entry) => entry.id));
    return [...logged.filter((entry) => !seen.has(entry.id)), ...activity];
}
