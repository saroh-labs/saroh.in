/**
 * The one place a state's sentences are written (UX audit, 10 Oct 2026).
 *
 * A page that couldn't be read was titled in three grammars ("Couldn't load
 * products" beside "Invoices could not be loaded"), thirteen bodies used a
 * developer's words, and a plan prompt had six labels. The named states in
 * `data-state.tsx` read these, and so does any screen that has to say the
 * same thing in a line of its own. A new screen has nothing to word.
 *
 * Rules these keep: sentence case, a full stop on a sentence and none on a
 * title, "business" and "modules", "Try again", and no long dash or
 * semicolon.
 */

/** The action that reads again. Never "Retry", never "Reload the page". */
export const TRY_AGAIN = "Try again";

/** What is true after a failed READ. A boundary a write can reach adds to it. */
export const NOTHING_CHANGED = "Nothing has been changed.";

/** A failed read's title: "Couldn't load invoices". */
export function couldntLoad(things = "this"): string {
    return `Couldn't load ${things}`;
}

/** The same as a sentence, for a line with no title: "Couldn't load invoices." */
export function couldntLoadLine(things = "this"): string {
    return `${couldntLoad(things)}.`;
}

/**
 * A failed read's body: that nothing changed, then the one reassurance the
 * screen can truthfully add ("Your published site is unaffected.").
 */
export function nothingChanged(reassurance?: string | null): string {
    const more = reassurance?.trim();
    return more ? `${NOTHING_CHANGED} ${more}` : NOTHING_CHANGED;
}

/** A way back, by the menu's name for the place: "Back to Orders". */
export function backTo(place = "Home"): string {
    return `Back to ${place}`;
}

/** A first-run title: "No bookings yet". */
export function noneYet(things: string): string {
    return `No ${things} yet`;
}

/** A record that isn't there: "Order not found". */
export function notFoundTitle(thing: string): string {
    const name = thing.trim();
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} not found`;
}

/** Why a list has nothing in it although the business has some. */
export type NoResultsCause = "search" | "filters" | "view";

/**
 * A search, a filter or a tab that left nothing: "No invoices match “q”".
 * Curly quotes, and no full stop (it is a title).
 */
export function noResultsTitle(
    things: string,
    cause: NoResultsCause = "search",
    query?: string | null,
): string {
    const q = query?.trim();
    if (cause === "search" && q) return `No ${things} match “${q}”`;
    if (cause === "view") return `No ${things} here`;
    return `No ${things} match`;
}

/** A picker's one line: "No customers match “q”." */
export function noMatchLine(things: string, query?: string | null): string {
    return `${noResultsTitle(things, "search", query)}.`;
}

/** The way back from no results, by what caused it. */
export function clearLabel(cause: NoResultsCause, things: string): string {
    if (cause === "search") return "Clear search";
    if (cause === "filters") return "Clear filters";
    return `Show all ${things}`;
}

/**
 * The one label for a plan prompt: "See Grow" when one plan unlocks the
 * thing, "See plans" otherwise. Never "Upgrade to", "Choose a plan", "See
 * Plan and billing" or "See your plan".
 */
export function planLabel(plan?: string | null): string {
    const name = plan?.trim();
    return name ? `See ${name}` : "See plans";
}

/** What someone who can't change the plan reads where the link would be. */
export const WHO_CAN_CHANGE_PLAN =
    "The owner can change the plan in Settings › Plan and billing.";

/** A module that is off. */
export const moduleOff = {
    title: (name: string) => `${name} is turned off`,
    body: "Nothing is deleted. Turn it on to bring it back.",
    /** For someone who can't turn it on: no promise of a switch. */
    bodyNoSwitch: "Nothing is deleted. Turning it on brings it back.",
    action: "Turn on in Modules",
    who: "An owner or admin can turn it on in Settings › Modules.",
} as const;

/** A thing the business's plan leaves out. */
export const planLocked = {
    title: (name: string, plan?: string | null) =>
        plan?.trim()
            ? `${name} comes with ${plan.trim()}`
            : `${name} isn't in your plan`,
    body: "Nothing is deleted. It's all here when the plan changes.",
} as const;

/** A session that ran out. Not a denial: no role can lift it. */
export const signedOut = {
    title: "Your session has ended",
    body: "Sign in again to pick up where you left off.",
    action: "Sign in",
} as const;

/** A member the plan's team limit has paused. */
export const paused = {
    title: (business?: string | null) =>
        business?.trim()
            ? `Your access to ${business.trim()} is paused`
            : "Your access is paused",
    body: "Its plan includes fewer team members than it has, so the people who joined most recently are paused. Nothing of yours is deleted.",
    who: "The owner can bring you back in Settings › Plan and billing.",
} as const;

/** The two providers a business connects, in a merchant's words. */
export type ProviderKind = "payment" | "email";

/** Payments or email with no provider connected. */
export const providerDisconnected = {
    title: (kind: ProviderKind) =>
        kind === "payment"
            ? "No payment provider connected"
            : "No email provider connected",
    body: (kind: ProviderKind) =>
        kind === "payment"
            ? "Connect one to take payments online."
            : "Connect one to send email from your business.",
    /** Both in one line, for a row or a sheet. */
    line: (kind: ProviderKind) =>
        kind === "payment"
            ? "No payment provider is connected, so customers can't pay online."
            : "No email provider is connected, so no email is sent.",
    action: "Connect in Providers",
    who: "An owner or admin can connect one in Settings › Providers.",
    href: "/settings/providers",
} as const;

/** A website that has never been published, or was taken down. */
export const notPublished = {
    title: "Your website isn't live yet",
    body: "Publish it and customers can open it.",
    line: "Your website isn't live yet.",
    action: "Go to Website",
    who: "An owner or admin can publish it in Website.",
    href: "/sites",
} as const;
