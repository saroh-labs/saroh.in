/**
 * The one sentence for "who can change this" (UX audit, 10 Oct 2026).
 *
 * A person stopped by their role was told so in 28 wordings and nine title
 * grammars. Every denial now reads the same three lines: what they can't
 * open, what their role is and that it doesn't include it, and who can change
 * that. `AccessDenied`, `ReadOnlyNote`, `requireCan` and the module gate all
 * read these, so a new denial has nothing to word.
 *
 * `thing` is the menu's name for it (Sell, Contacts, Bookings), or what the
 * person was about to do ("new customers"). Never the API's name for a
 * module ("Commerce", "CRM"): `moduleName` in `lib/modules/names.ts` maps
 * those.
 */

/** Who can lift a denial by role. */
export const WHO_CAN_CHANGE =
    "An owner or admin can change this in Settings › Team.";

/** The same, for what no role but the owner's reaches. */
export const ONLY_OWNER_CAN_CHANGE = "Only the owner can change this.";

/** `WHO_CAN_CHANGE`, or the owner's line for an owner-only thing. */
export function whoCanChangeLine(ownerOnly = false): string {
    return ownerOnly ? ONLY_OWNER_CAN_CHANGE : WHO_CAN_CHANGE;
}

export interface WhoCanChange {
    /** "You can't open {thing}" */
    title: string;
    /** "Your role in {business} is {role}. It doesn't include {thing}." */
    description: string;
    /** Who can change it. */
    note: string;
}

/**
 * The three lines of a denial. With no `business` or `role` to hand (a
 * boundary that only knows a 403 came back) the body says what is still
 * true and names neither.
 */
export function whoCanChange({
    thing = "this",
    business,
    role,
    ownerOnly = false,
}: {
    thing?: string;
    business?: string | null;
    role?: string | null;
    ownerOnly?: boolean;
} = {}): WhoCanChange {
    const where = business?.trim() ? ` in ${business.trim()}` : "";
    const named = role?.trim();
    return {
        title: `You can't open ${thing}`,
        description: named
            ? `Your role${where} is ${named}. It doesn't include ${thing}.`
            : `Your role${where} doesn't include ${thing}.`,
        note: whoCanChangeLine(ownerOnly),
    };
}

/**
 * The first sentence of a read-only note: "Your role can read {thing} but
 * not change it." `ReadOnlyNote` adds who can.
 */
export function readOnlyLine(thing: string, plural = false): string {
    return `Your role can read ${thing} but not change ${plural ? "them" : "it"}.`;
}
