import { formatDay } from "@/lib/format/datetime";
import { count, plural } from "@/lib/format/plural";
import type { SiteOverview } from "@/lib/sites/service";

type Results = NonNullable<SiteOverview["results"]>;
type Activity = SiteOverview["activity"][number];
type Health = SiteOverview["needsDoing"][number];

/**
 * The results line's parts (WXHOverview): "297 visits · 6 bookings
 * started · 2 questions · 1 order". Only what is measured (A3): started
 * and paid are absent while nothing on the site is sold, and their words
 * say what the site sells, since a checkout may be a booking or an order.
 */
export function resultParts(r: Results): string[] {
    const parts = [count(r.visits, "visit")];
    const { bookings, shop } = r.sells;
    if (r.started !== null) {
        const what =
            bookings && shop
                ? "bookings or orders"
                : bookings
                  ? "bookings"
                  : "orders";
        parts.push(`${r.started} ${what} started`);
    }
    parts.push(count(r.questions, "question"));
    if (r.paid !== null) {
        parts.push(
            bookings && shop
                ? `${r.paid} paid online`
                : bookings
                  ? count(r.paid, "paid booking")
                  : count(r.paid, "order"),
        );
    }
    return parts;
}

/** "10 Nov to 16 Nov". */
export function resultsRange(r: Pick<Results, "from" | "to">): string {
    return `${formatDay(r.from)} to ${formatDay(r.to)}`;
}

/** "Mon", for a day's column. */
export function weekdayOf(key: string): string {
    return formatDay(key, { weekday: "short" }).split(" ")[0] ?? key;
}

/** One item of What needs doing: one issue, every page that has it. */
export interface NeedsDoingItem {
    issue: Health["issues"][number];
    title: string;
    line: string;
    /** The first page with it: Add opens there (U5's page sheet). */
    pageId: string;
    action: string;
}

const ISSUE_WORDS: Record<
    Health["issues"][number],
    { title: (n: number) => string; why: string; action: string }
> = {
    googleText: {
        title: (n) =>
            `${count(n, "page")} ${plural(n, "has", "have")} no text for Google`,
        why: "Google shows a random line instead.",
        action: "Add",
    },
    shareImage: {
        title: (n) =>
            `${count(n, "page")} ${plural(n, "has", "have")} no share photo`,
        why: "A link shared on WhatsApp shows no picture.",
        action: "Add photo",
    },
    brokenLink: {
        title: (n) =>
            `${count(n, "page")} ${plural(n, "has", "have")} a link that goes nowhere`,
        why: "Visitors who press it get nothing.",
        action: "Fix",
    },
    hiddenByRoute: {
        title: (n) =>
            `${count(n, "page")} ${plural(n, "is", "are")} hidden behind a built-in page`,
        why: "Visitors can't open it until it has its own link.",
        action: "Fix",
    },
};

/** At most three, one per issue, with the pages it is on (WXHOverview). */
export function needsDoingItems(pages: readonly Health[]): NeedsDoingItem[] {
    const order: Health["issues"][number][] = [
        "hiddenByRoute",
        "brokenLink",
        "googleText",
        "shareImage",
    ];
    return order.flatMap((issue) => {
        const on = pages.filter((p) => p.issues.includes(issue));
        const first = on.at(0);
        if (!first) return [];
        const words = ISSUE_WORDS[issue];
        return [
            {
                issue,
                title: words.title(on.length),
                line: `${on.map((p) => p.title).join(", ")}. ${words.why}`,
                pageId: first.pageId,
                action: words.action,
            },
        ];
    });
}

/** A first name, as the boards say people ("Ritika"). */
export function firstName(name: string | null): string | null {
    const trimmed = name?.trim() ?? "";
    return trimmed === "" ? null : trimmed.split(/\s+/)[0];
}

/** "Ritika published the site"; "Changes saved on Home" with no name. */
export function activityWords(a: Activity): { title: string; line: string } {
    const who = firstName(a.by);
    const said = (did: string) =>
        who ? `${who} ${did}` : did.charAt(0).toUpperCase() + did.slice(1);
    const subject = a.subject ?? "a page";
    switch (a.kind) {
        case "published":
            return { title: said("published the site"), line: "Went live" };
        case "restored":
            return {
                title: said("put an earlier version back"),
                line: "Went live",
            };
        case "test_link_live":
            return {
                title: said("put a test link live"),
                line: "Went live",
            };
        case "post_published":
            return {
                title: said(`published “${subject}”`),
                line: "Post · went live on its own",
            };
        case "page_settings":
            return {
                title: said(`changed the ${subject} page's settings`),
                line: "Goes live when you publish",
            };
        case "saved":
            return {
                title: `Changes saved on ${subject}`,
                line: "Goes live when you publish",
            };
        case "approval_on":
            return {
                title: said("turned on publishing needs approval"),
                line: "Setting",
            };
        case "approval_off":
            return {
                title: said("turned off publishing needs approval"),
                line: "Setting",
            };
        case "look_updated":
            return {
                title: said("moved the site to the new look"),
                line: "Goes live when you publish",
            };
        case "draft_rolled_back":
            return {
                title: said("put an earlier draft back"),
                line: "Goes live when you publish",
            };
    }
}

/** Initials for an activity row's circle; "·" with no name. */
export function initialsOf(name: string | null): string {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "·";
    return parts
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase())
        .join("");
}
