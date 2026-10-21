import type { LookId } from "@saroh/block-contract";

import { clockParts } from "../lib/clock";
import { trimTrailingSlashes } from "../url-path";
import { currentTab } from "./hrefs";
import type { AccountTab } from "./model";
import { firstName } from "./model";

/**
 * The words around a look's account (DEC-172, plan U12): the tabs' labels,
 * the page's title and Home's greeting. Pure, so the server and the
 * browser say the same thing.
 */

/**
 * A tab's label under a look: "Details" for Your details, which is the
 * page's title (the owner's decision, 20 Oct), so six tabs fit a phone's
 * row. Every other tab keeps the API's own word.
 */
export function lookTabLabel(tab: AccountTab): string {
    return tab.key === "me" ? "Details" : tab.label;
}

/** "Good morning" by the hour on the business's clock. */
export function greetingWords(
    now: Date | string,
    timeZone: string | null | undefined,
): string {
    let hour: number;
    try {
        hour = clockParts(now, timeZone ?? "Asia/Kolkata").hour;
    } catch {
        hour = clockParts(now, "Asia/Kolkata").hour;
    }
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    return "Good evening";
}

/** What the page's title says, and the name in it set apart (Home). */
export interface LookTitle {
    /** The words before the name, or the whole title. */
    text: string;
    /** The first name, drawn in the look's italic; null for none. */
    name: string | null;
}

/**
 * The page's one heading under a look, by its path: Home greets the
 * customer by first name ("Good morning, Asha."; Live's "Hi, Asha."),
 * a thing's own page is named for the thing, and a tab is its page's
 * title ("Your details" for Details).
 */
export function lookAccountTitle({
    pathname,
    tabs,
    name,
    look,
    greeting,
}: {
    pathname: string | null;
    tabs: AccountTab[];
    name: string | null;
    look: LookId;
    /** "Good morning", worked out where the page was drawn. */
    greeting: string;
}): LookTitle {
    const path = trimTrailingSlashes(pathname ?? "");
    if (path.startsWith("/account/receipts/")) {
        return { text: "Receipt", name: null };
    }
    if (path.startsWith("/account/orders/")) {
        return { text: "Your order", name: null };
    }
    if (path.startsWith("/account/bookings/")) {
        return { text: "Your booking", name: null };
    }
    const tab = currentTab(path === "" ? null : path, tabs);
    if (tab === "home" || tab === null) {
        const first = firstName(name);
        const opening = look === "live" ? "Hi" : greeting;
        if (!first) {
            return {
                text: look === "live" ? "Hi there." : `${opening}.`,
                name: null,
            };
        }
        return { text: `${opening}, `, name: first };
    }
    if (tab === "me") return { text: "Your details", name: null };
    const label = tabs.find((t) => t.key === tab)?.label;
    return { text: label ?? "Your account", name: null };
}

/**
 * Where signing in returns to, in words: "the home page", or the name of
 * the page the visitor was on ("Timetable"). Null when there is no page
 * to go back to: they stay on the account page that asked.
 */
export function backWords(
    back: { from: string; title: string } | null,
): string | null {
    if (!back) return null;
    const path = back.from.split(/[?#]/)[0] ?? "";
    if (path === "" || path === "/") return "the home page";
    const title = back.title.trim();
    return title.length > 0 && title.length <= 60
        ? title
        : "the page you were on";
}

/** With accounts switched off, the page under a look says this. */
export const ACCOUNTS_OFF_TEXT =
    "Sign-in isn't used on this site. Your bookings are in your email.";
