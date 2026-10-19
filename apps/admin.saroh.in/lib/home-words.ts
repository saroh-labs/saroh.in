import { formatRelative, plural } from "./format";

/**
 * Home's "Needs you" in words (admin console redesign U10, R14). Client-safe:
 * the API's `GET /admin/home` sends counts and dates only, and these rules
 * say each one and where its fix is.
 */

/** Mirrors the API's `NEEDS_KINDS` (`admin-home.service.ts`), in its order. */
export type NeedsKind = "billing" | "reports" | "help" | "sign-ups" | "jobs";

export interface NeedsYouItem {
    kind: NeedsKind;
    count: number;
    /** The oldest one waiting; for help and jobs, the newest. */
    at: string | null;
}

export interface ConsoleHome {
    needs: NeedsYouItem[];
    checked: NeedsKind[];
    counts: {
        businesses: number;
        businessesThisWeek: number;
        noBusinessYet: number;
        paying: number | null;
        jobsFailedToday: number | null;
    };
}

export type NeedsTone = "error" | "warning" | "info" | "neutral";

export interface NeedsRow {
    kind: NeedsKind;
    /** The small label before the title: what area it is. */
    area: string;
    tone: NeedsTone;
    title: string;
    detail: string;
    /** Where the fix is, already filtered to these rows. */
    href: string;
    /** The link's words, naming what it does. */
    action: string;
}

/** What each kind is, and where it is fixed. */
export function needsRow(item: NeedsYouItem, now: Date = new Date()): NeedsRow {
    const n = item.count;
    const when = item.at ? formatRelative(item.at, now) : null;
    switch (item.kind) {
        case "billing":
            return {
                kind: item.kind,
                area: "Billing",
                tone: "error",
                title:
                    n === 1
                        ? "A billing problem needs you"
                        : `${n} billing problems need you`,
                detail: when ? `The oldest came in ${when}` : "Waiting",
                href: "/billing/actions",
                action: "Open Needs action",
            };
        case "reports":
            return {
                kind: item.kind,
                area: "Reports",
                tone: "warning",
                title:
                    n === 1
                        ? "A customer reported a business"
                        : `${n} customers reported a business`,
                detail: when
                    ? `The oldest came in ${when}`
                    : "Not looked at yet",
                href: "/reports",
                action: n === 1 ? "Review it" : "Review them",
            };
        case "help":
            return {
                kind: item.kind,
                area: "Messages",
                tone: "warning",
                title:
                    n === 1
                        ? "Someone asked for help this week"
                        : `${n} people asked for help this week`,
                detail: when
                    ? `From saroh.in/contact · the newest ${when}`
                    : "From saroh.in/contact",
                href: "/messages?topic=help",
                action: "Read them",
            };
        case "sign-ups":
            return {
                kind: item.kind,
                area: "Users",
                tone: "info",
                title:
                    n === 1
                        ? "A sign-up is stuck before verifying their email"
                        : `${n} sign-ups are stuck before verifying their email`,
                detail: when
                    ? `No business yet · the first joined ${when}`
                    : "No business yet",
                href: "/users?filter=no-business,unverified",
                action: "Help them",
            };
        case "jobs":
            return {
                kind: item.kind,
                area: "Jobs",
                tone: "neutral",
                title:
                    n === 1
                        ? "A job failed after every retry"
                        : `${n} jobs failed after every retry`,
                detail: when ? `This week · the last ${when}` : "This week",
                href: "/operations/jobs?status=FAILED",
                action: "Open Jobs",
            };
    }
}

/** The line under Home's heading: how many things need you, or none. */
export function homeSummary(home: ConsoleHome | null): string {
    if (!home) return "Use the menu or the search to find what you came for.";
    const total = home.needs.reduce((sum, item) => sum + item.count, 0);
    if (total === 0) return "Nothing needs you. Everything is running.";
    return `${plural(total, "thing needs", "things need")} you.`;
}

const HOUR_IN_INDIA = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
});

/**
 * "Good morning" by India's clock, as the console tells every time: the
 * page is drawn on a server whose own clock is UTC.
 */
export function greeting(now: Date = new Date()): string {
    const hour = Number(HOUR_IN_INDIA.format(now));
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}
