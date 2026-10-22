import { roleName } from "./role-name";
import { shownRoleLabel } from "./storefront-team";

/**
 * Telling a new team member where they are (UX audit, 10 Oct). Someone who
 * accepted an invitation landed on a screen with no word of which business
 * it was or what they could do in it. Now a line greets them once:
 *
 *   "You've joined Rye & Co. as Reviewer. You can read and comment on the
 *   pages you were asked to look at."
 *
 * Accepting goes through the workspace's own door (`/open/:id`), which is
 * the one place that may write the open business. So a location's
 * invitation switches to the right business too, which it never did. The
 * door leaves the line in a cookie that lasts a minute, and the shell shows
 * it and takes it away (`components/shared/joined-notice.tsx`).
 *
 * Pure, so the words and the way in are tested without a browser.
 */

/** Carries the arrival line across the one redirect. Not httpOnly: the page reads it. */
export const JOINED_COOKIE = "saroh_joined";

/** A minute: long enough for the redirect, short enough to be once. */
export const JOINED_MAX_AGE_SECONDS = 60;

interface JoinedAs {
    name: string;
    role?: string | null;
    roleKey?: string | null;
    roleLabel?: string | null;
}

/** What each role opens, in one sentence. By the stored role, never a guess. */
const OPENS: Readonly<Record<string, string>> = {
    OWNER: "You can do everything here, including the plan and who has access.",
    ADMIN: "You can change the business and invite people.",
    MEMBER: "You can see its bookings, contacts and orders, and move orders along.",
    REVIEWER:
        "You can read and comment on the pages you were asked to look at.",
    // A location's team (DEC-074): its own locations' orders, no money.
    "storefront-team":
        "You can work the orders at the locations you were added to.",
    // A diary person given a login (#868).
    "calendar-only": "You can see and change your own bookings.",
};

/** For a role the business made: its menu is the honest answer. */
const OPENS_MADE = "Your menu shows what this role opens.";

export function roleOpens(as: Pick<JoinedAs, "role" | "roleKey">): string {
    const key = as.roleKey ?? as.role ?? "";
    return OPENS[key] ?? OPENS_MADE;
}

/** "You've joined Rye & Co. as Reviewer. ‹what that role opens›" */
export function joinedLine(as: JoinedAs): string {
    const role = shownRoleLabel(roleName(as));
    return `You've joined ${as.name.trim()} as ${role}. ${roleOpens(as)}`;
}

const STARTS = "You've joined ";
const MAX = 320;

/** The cookie's value for a line. */
export function encodeJoined(line: string): string {
    return encodeURIComponent(line.slice(0, MAX));
}

/**
 * The line a cookie carries, or null for anything that is not one: the
 * cookie can be written by anything on the page, so only a line of this
 * shape and length is ever shown, and it is shown as text.
 */
export function decodeJoined(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let line: string;
    try {
        line = decodeURIComponent(raw);
    } catch {
        return null;
    }
    if (!line.startsWith(STARTS) || line.length > MAX) return null;
    return line;
}

/** The named cookie's value out of `document.cookie`. */
export function cookieValue(all: string, name: string): string | null {
    for (const part of all.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return rest.join("=");
    }
    return null;
}

/**
 * Where the door may send someone: a path in this app and nothing else.
 * The address is in a link, so it is never trusted to be one of ours.
 */
export function safeArrival(to: string | null | undefined): string {
    if (!to || !to.startsWith("/") || to.startsWith("//")) return "/";
    // The browser turns `\` into `/` and drops tabs and newlines.
    if (/[\\\t\n\r]/.test(to)) return "/";
    return to;
}

/**
 * The door for someone who has just accepted an invitation: it opens that
 * business, leaves the arrival line, and goes on to `to`.
 */
export function joinDoor(organizationId: string, to: string): string {
    const q = new URLSearchParams({ joined: "1", to });
    return `/open/${encodeURIComponent(organizationId)}?${q.toString()}`;
}

/**
 * Where a location's invitation lands: Orders for that location, which the
 * Location team's menu lists. It used to land on the location's own
 * settings, a screen their menu never shows.
 */
export function locationArrival(storeId: string): string {
    return `/commerce/orders?storefront=${encodeURIComponent(storeId)}`;
}
