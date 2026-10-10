/**
 * What a person who was removed from a business reads when they next arrive
 * (UX-073). Without it, someone removed from their only business landed on
 * "Set up Saroh · Last step" as if they were new, with no word of why.
 *
 * Read from the active-business cookie: it still names a business the
 * session is no longer a member of. Its name rides in a second cookie written
 * beside it, so the line can say which; one written before that carries no
 * name, and the line says "the business". It stops once they set up or open
 * a business, which writes the cookie again.
 *
 * The cookies belong to the browser, not the person: someone else signing in
 * or up on it finds the last person's business there. So a third cookie
 * names who chose it, and the line is said only to them — never to a new
 * account on a shared browser, told it was removed from a business it was
 * never in. One written before that cookie says nothing.
 */

/** The active business's name, kept beside its id (`active_org`). */
export const ACTIVE_ORG_NAME_COOKIE = "active_org_name";

/** The user who chose the active business, kept beside its id. */
export const ACTIVE_ORG_USER_COOKIE = "active_org_user";

export function leftBusinessNotice({
    activeId,
    activeName,
    activeUser,
    userId,
    memberOf,
}: {
    /** The `active_org` cookie. */
    activeId: string | null | undefined;
    /** The `active_org_name` cookie. */
    activeName: string | null | undefined;
    /** The `active_org_user` cookie: who chose that business. */
    activeUser: string | null | undefined;
    /** The signed-in user. */
    userId: string;
    /** The businesses the session is in now. */
    memberOf: readonly string[];
}): string | null {
    if (!activeId || memberOf.includes(activeId)) return null;
    if (!activeUser || activeUser !== userId) return null;
    const which = activeName?.trim() ? activeName.trim() : "that business";
    return `You're no longer in ${which} — someone there removed you, or it closed. Your account is still yours: set one up of your own below, or ask them to invite you again.`;
}
