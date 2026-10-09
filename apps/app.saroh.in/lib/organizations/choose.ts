/**
 * "Which business?" (`/choose`) and the door that opens one (`/open/:id`),
 * as pure rules (UX-084).
 *
 * A business an operator suspended, or one closing, still opens: its data
 * is read-only, not gone. But it is not one to start the day in, so the
 * chooser lists it apart, after the live ones, saying which state it is in
 * — never as one more card that looks like the rest.
 *
 * And a link that opens a business the person isn't in (a forwarded
 * `/open/…` link, a business they left) says so on the chooser, rather than
 * landing them somewhere with no word of why.
 */

/** A membership as the chooser needs it. */
export interface Choosable {
    id: string;
    role: string;
    /**
     * `ACTIVE`, or the state an operator put the business in. Absent from
     * an API older than it, which reads as open.
     */
    lifecycleStatus?: string;
}

/** What each state that takes no new activity is called. */
const STATE_WORDS: Record<string, string> = {
    SUSPENDED: "Suspended",
    PENDING_DELETION: "Closing",
    DELETED_RETAINED: "Closed",
};

/**
 * The state of a business that isn't taking new activity, in a word, or
 * null for an open one. An unknown state the API adds later reads as not
 * open, so it is never shown as a live business by accident.
 */
export function lifecycleLabel(status: string | undefined): string | null {
    if (!status || status === "ACTIVE") return null;
    return STATE_WORDS[status] ?? "Not open";
}

/**
 * Owned and invited, each live one first; then every business that isn't
 * open, together, whoever owns it.
 */
export function chooserGroups<T extends Choosable>(
    organizations: readonly T[],
): { owned: T[]; invited: T[]; closed: T[] } {
    const open = organizations.filter(
        (o) => lifecycleLabel(o.lifecycleStatus) === null,
    );
    return {
        owned: open.filter((o) => o.role === "OWNER"),
        invited: open.filter((o) => o.role !== "OWNER"),
        closed: organizations.filter(
            (o) => lifecycleLabel(o.lifecycleStatus) !== null,
        ),
    };
}

/** The query `/open` sends a refused link back to the chooser with. */
export const NOT_YOURS = "not-yours";

/** Where `/open/:id` sends a link to a business the person isn't in. */
export const NOT_YOURS_HREF = `/choose?notice=${NOT_YOURS}`;

/** The chooser's line for a refused `/open` link; null for anything else. */
export function chooseNotice(notice: string | string[] | undefined) {
    return notice === NOT_YOURS
        ? "That link opens a business you're not in, so it didn't open. Ask its owner to invite you, or pick one of yours."
        : null;
}

/**
 * Whether the chooser has a question to ask: with one business (or none)
 * it steps out of the way, unless it has something to say first.
 */
export function chooserSkips(
    count: number,
    notice: string | null,
): "/onboarding" | "/" | null {
    if (notice) return null;
    if (count === 0) return "/onboarding";
    if (count === 1) return "/";
    return null;
}
