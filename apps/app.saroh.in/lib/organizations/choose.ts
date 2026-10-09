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
    /**
     * Their access is paused (#800): the business moved to a lower plan
     * and has fewer team seats than people. Absent from an older API,
     * which reads as not paused.
     */
    paused?: boolean;
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
 * open, together, whoever owns it; then those whose door is paused for
 * this person (#800), which they can't open at all.
 */
export function chooserGroups<T extends Choosable>(
    organizations: readonly T[],
): { owned: T[]; invited: T[]; closed: T[]; paused: T[] } {
    const reachable = organizations.filter((o) => !o.paused);
    const open = reachable.filter(
        (o) => lifecycleLabel(o.lifecycleStatus) === null,
    );
    return {
        owned: open.filter((o) => o.role === "OWNER"),
        invited: open.filter((o) => o.role !== "OWNER"),
        closed: reachable.filter(
            (o) => lifecycleLabel(o.lifecycleStatus) !== null,
        ),
        paused: organizations.filter((o) => o.paused === true),
    };
}

/** The word on a business whose door is paused for this person. */
export const PAUSED_LABEL = "Paused";

/** What the chooser says under its paused group. */
export const PAUSED_NOTE =
    "Your access is paused: the business's plan has no room for you right now. Nothing of yours is lost. Ask its owner to choose a plan.";

/**
 * Which business to work in: the one last chosen while it is open to them,
 * else the first they can open, else (every one paused) the last chosen or
 * the first, which the shell then says is paused rather than guessing.
 */
export function pickActive<T extends Pick<Choosable, "id" | "paused">>(
    organizations: readonly T[],
    activeId: string | null | undefined,
): T | null {
    if (organizations.length === 0) return null;
    const active = organizations.find((o) => o.id === activeId);
    if (active && !active.paused) return active;
    return organizations.find((o) => !o.paused) ?? active ?? organizations[0];
}

/** The query `/open` sends a refused link back to the chooser with. */
export const NOT_YOURS = "not-yours";

/** Where `/open/:id` sends a link to a business the person isn't in. */
export const NOT_YOURS_HREF = `/choose?notice=${NOT_YOURS}`;

/**
 * What the workspace says when every business they're in has paused their
 * access (#800); the API's `MEMBER_PAUSED` refusal says the same.
 */
export const MEMBER_PAUSED_BODY =
    "Its plan includes fewer team members than it has, so the people who joined most recently are paused until it moves up again. Nothing of yours is lost. Ask the owner to choose a plan in Plan and billing.";

/** What switching to a business whose door is paused says (#800). */
export const PAUSED_ERROR =
    "Your access to that business is paused: its plan has no room for you right now. Nothing of yours is lost. Ask its owner to choose a plan.";

/** The query a business whose door is paused sends back with (#800). */
export const PAUSED = "paused";

/** Where opening a business whose door is paused for them goes. */
export const PAUSED_HREF = `/choose?notice=${PAUSED}`;

/** The chooser's line for a refused `/open` link; null for anything else. */
export function chooseNotice(notice: string | string[] | undefined) {
    if (notice === NOT_YOURS) {
        return "That link opens a business you're not in, so it didn't open. Ask its owner to invite you, or pick one of yours.";
    }
    if (notice === PAUSED) {
        return "That business didn't open: your access is paused because its plan has no room for you right now. Nothing of yours is lost. Ask its owner to choose a plan.";
    }
    return null;
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
