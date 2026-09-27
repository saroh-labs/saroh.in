/**
 * A customer's account on the business's website, as Customer Detail shows
 * it (round-2 plan A, A4; DEC-049): the "Signs in on your website" line and
 * the words of "This isn't them". Pure, so the copy is tested.
 */

/** `CustomerDetail.siteAccount`, as the API sends it. */
export interface SiteAccount {
    email: string;
    status: "ACTIVE" | "BLOCKED";
    linkedAt: string;
    lastSignedInAt: string | null;
    /** False on a record the sign-in made for itself. */
    canUnlink: boolean;
}

/** `GET …/customers/:contactId/account/unlink`. */
export interface UnlinkPreview {
    email: string;
    moves: { key: string; count: number; label: string }[];
    /** "2 bookings they made online move with them." */
    sentence: string;
}

/**
 * The line under their name. The email is shown only to someone who may
 * see contact details; everyone else learns only that they sign in.
 */
export function signsInLine(
    account: Pick<SiteAccount, "email" | "status">,
    showEmail: boolean,
): string {
    if (account.status === "BLOCKED") {
        return showEmail
            ? `Blocked from signing in on your website as ${account.email}`
            : "Blocked from signing in on your website";
    }
    return showEmail
        ? `Signs in on your website as ${account.email}`
        : "Signs in on your website";
}

/** The confirm for "This isn't them". */
export function unlinkConfirm(
    name: string,
    preview: UnlinkPreview,
): { title: string; description: string } {
    return {
        title: `${preview.email} isn't ${name}?`,
        description: [
            `Whoever signs in with ${preview.email} gets a customer record of their own and is signed out of your website.`,
            preview.sentence,
            `${name}'s email no longer counts as confirmed, and the two won't be suggested as the same person again. This cannot be undone.`,
        ].join(" "),
    };
}

/** The toast once they're apart. */
export function unlinkedLine(email: string): string {
    return `Done. ${email} now has a customer record of their own.`;
}
