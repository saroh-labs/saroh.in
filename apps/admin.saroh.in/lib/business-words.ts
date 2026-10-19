import type { BusinessView, SiteTrackersRow } from "./businesses";
import { asWords, plural } from "./format";
import type { OverviewWebsite } from "./overview-words";
import { memberRole } from "./overview-words";
import { addressHost, providerName } from "./what-they-see";

/**
 * The words of a business's Website and payments, Team, Notes and History
 * tabs, and of its support session (admin plan U6, R7, R8, R16).
 * Client-safe: types only from `businesses`.
 */

/**
 * What each of a business's built-in roles can do there, in one line. The
 * same as the workspace tells someone who joins (`roleOpens` in
 * `app.saroh.in/lib/organizations/joined.ts`), said about them.
 */
const ROLE_CAN: Readonly<Record<string, string>> = {
    OWNER: "Can do everything, including the plan and who has access",
    ADMIN: "Runs the business and invites people. Can't change the plan",
    MEMBER: "Sees bookings, contacts and orders, and moves orders along",
    REVIEWER: "Reads and comments on the pages they were asked to look at",
};

/** A role the business made itself: its own Team settings say what it opens. */
export const MADE_ROLE_CAN =
    "A role the business made. Its Team settings say what it opens";

/** What someone with this role can do in the business. */
export function roleCan(role: string): string {
    return ROLE_CAN[role] ?? MADE_ROLE_CAN;
}

/** "Owner · Can do everything, …" for a team row's second line. */
export function roleLine(role: string): string {
    return `${memberRole(role)} · ${roleCan(role)}`;
}

/** The built-in roles staff can give, each with what it can do. */
export const ROLE_CHOICES: readonly {
    value: string;
    label: string;
    can: string;
}[] = ["OWNER", "ADMIN", "MEMBER", "REVIEWER"].map((value) => ({
    value,
    label: memberRole(value),
    can: roleCan(value),
}));

const IST_TIME = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
});

/**
 * "14:30": when an open support session lapses, in India's time like
 * every other time the console says about money and sessions, so the
 * server and the browser draw the same. Null when unknown.
 */
export function sessionTime(
    expiresAt: string | null | undefined,
): string | null {
    if (!expiresAt) return null;
    const at = new Date(expiresAt);
    if (Number.isNaN(at.getTime())) return null;
    return IST_TIME.format(at);
}

/** "Open until 14:30", beside Close support access (R16). */
export function sessionUntil(
    expiresAt: string | null | undefined,
): string | null {
    const time = sessionTime(expiresAt);
    return time ? `Open until ${time}` : null;
}

/* ------------------------------------------------------------------ */
/* Website and payments                                                */
/* ------------------------------------------------------------------ */

export type RowTone = "success" | "warning" | "neutral";

/** One row of Website and payments: what it is, and who can fix it. */
export interface PresenceRow {
    key: string;
    label: string;
    /** The pill: "Published", "Not published", "Connected", … */
    state: string;
    tone: RowTone;
    /** The line under it, in words. */
    text: string;
    /** A live address to open, without its scheme. */
    link: { href: string; text: string } | null;
    /** Only the business can do it: the steps to send them. */
    steps: string | null;
}

/** Each site, published or not, with its first live address. */
export function siteRows(
    website: OverviewWebsite,
    businessName: string,
): PresenceRow[] {
    return website.sites.map((site) => {
        const first = site.addresses.at(0);
        const link = first
            ? { href: first.url, text: addressHost(first.url) }
            : null;
        if (site.published) {
            return {
                key: `site-${site.id}`,
                label: site.name,
                state: "Published",
                tone: "success" as const,
                text:
                    site.addresses.length > 1
                        ? `Live at ${plural(site.addresses.length, "address", "addresses")}`
                        : "Live for their customers",
                link,
                steps: null,
            };
        }
        return {
            key: `site-${site.id}`,
            label: site.name,
            state: "Not published",
            tone: "warning" as const,
            text: "Customers can't see it yet. Only the business can publish it.",
            link: null,
            steps: publishSteps(businessName, site.name),
        };
    });
}

/**
 * The payments row: connected, connected with keys that were refused, or
 * not connected. Only the business holds its provider keys, so the fix is
 * always theirs.
 */
export function paymentsRow(
    payments: OverviewWebsite["payments"],
    businessName: string,
): PresenceRow {
    const refused = payments.filter((p) => p.connected && p.needsAttention);
    if (refused.length > 0) {
        const names = refused.map((p) => providerName(p.provider)).join(", ");
        return {
            key: "payments",
            label: "Payments",
            state: "Needs attention",
            tone: "warning",
            text: `${names} refused its keys, so customers can't pay online. Only the business can enter them again.`,
            link: null,
            steps: paymentSteps(businessName, names),
        };
    }
    const connected = payments.filter((p) => p.connected);
    if (connected.length > 0) {
        return {
            key: "payments",
            label: "Payments",
            state: "Connected",
            tone: "success",
            text: `Through ${connected.map((p) => providerName(p.provider)).join(", ")}`,
            link: null,
            steps: null,
        };
    }
    return {
        key: "payments",
        label: "Payments",
        state: "Not connected",
        tone: "neutral",
        text: "Only the business can connect Razorpay or Cashfree.",
        link: null,
        steps: paymentSteps(businessName, null),
    };
}

/** The words an operator sends a business to publish its site. */
export function publishSteps(businessName: string, siteName: string): string {
    return [
        `Hi ${businessName},`,
        `Your site ${siteName} isn't published yet, so your customers can't see it.`,
        "Sign in to Saroh, open Website and press Publish. It only takes a minute, and we can't do it for you.",
    ].join("\n\n");
}

/** The words an operator sends a business to connect (or fix) payments. */
export function paymentSteps(
    businessName: string,
    refused: string | null,
): string {
    return [
        `Hi ${businessName},`,
        refused
            ? `${refused} refused the keys saved in Saroh, so your customers can't pay online.`
            : "Your customers can't pay online yet, because no payment provider is connected.",
        refused
            ? `Sign in to Saroh, open Settings › Providers and enter your ${refused} keys again.`
            : "Sign in to Saroh, open Settings › Providers and connect Razorpay or Cashfree with your own account's keys.",
        "Only you can do this: the keys are yours, and we never see them.",
    ].join("\n\n");
}

/** A site's trackers: allowed, or switched off by Saroh. */
export function trackerState(site: SiteTrackersRow): {
    state: string;
    tone: "error" | "outline";
    text: string;
} {
    if (site.switchedOff) {
        return {
            state: "Switched off by Saroh",
            tone: "error",
            text: "None load, whatever their plan. Only Saroh can switch them back on.",
        };
    }
    return {
        state: "Allowed",
        tone: "outline",
        text:
            site.trackersOn === 0
                ? "None set up"
                : `${plural(site.trackersOn, "tracker")} on`,
    };
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/** One line of a business's history, from either side. */
export interface HistoryRow {
    /** Unique across both sides. */
    id: string;
    /** The business's own activity, or something Saroh's team did. */
    source: "business" | "staff";
    title: string;
    /** Who, and for staff the reason they gave. */
    detail: string;
    at: string;
}

type Activity = Extract<
    BusinessView["activity"],
    { status: "ok" }
>["data"][number];
type StaffAction = Extract<
    BusinessView["operatorActions"],
    { status: "ok" }
>["data"][number];

function outcome(value: string): string {
    return value === "SUCCESS" ? "" : ` · ${asWords(value)}`;
}

/**
 * The business's own activity and what Saroh's team did to it, as one
 * list, newest first (R16: one history, not two). A side that couldn't be
 * read is left out; the caller says so.
 */
export function mergeHistory(
    activity: readonly Activity[],
    staff: readonly StaffAction[],
): HistoryRow[] {
    const rows: HistoryRow[] = [
        ...activity.map((row) => ({
            id: `business-${row.id}`,
            source: "business" as const,
            title: asWords(row.action),
            detail: `${
                row.actor ??
                (row.actorUserId.startsWith("system:")
                    ? "Saroh, automatically"
                    : "Someone in the business")
            }${outcome(row.outcome)}`,
            at: row.createdAt,
        })),
        ...staff.map((row) => ({
            id: `staff-${row.id}`,
            source: "staff" as const,
            title: asWords(row.action),
            detail: [
                row.actor ?? "Someone on Saroh's team",
                row.reason ? `“${row.reason}”` : null,
            ]
                .filter(Boolean)
                .join(" · ")
                .concat(outcome(row.outcome)),
            at: row.createdAt,
        })),
    ];
    return rows.sort((a, b) => {
        const diff = new Date(b.at).getTime() - new Date(a.at).getTime();
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
}

/** Who did it, as the row's pill says. */
export const HISTORY_SOURCE: Record<HistoryRow["source"], string> = {
    business: "The business",
    staff: "Saroh's team",
};
