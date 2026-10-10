/**
 * Leaving a business, in words (UX audit, 10 Oct 2026).
 *
 * Anyone who is a member can leave: it asks no permission, only the last
 * owner is refused (the API's rule, `OrganizationMembersService.leave`).
 * The confirm says what they lose before they lose it, and the only owner
 * reads why they can't and what to do first, in place of the button.
 *
 * Pure and client-safe.
 */
import { accountsUrl } from "@/lib/accounts";

/** Where someone lands once they have left: their businesses, on accounts. */
export const AFTER_LEAVING_URL = `${accountsUrl}/businesses`;

/** The button, and the confirm's own. */
export function leaveLabel(business: string): string {
    return `Leave ${business}`;
}

/**
 * Whether this person is the business's only owner, from the roster. Null
 * when the roster couldn't be read (or isn't theirs to read): the button is
 * offered and the API decides, saying why inside the confirm.
 */
export function isOnlyOwner(
    members:
        | readonly { role?: string; roleKey?: string; isSelf?: boolean }[]
        | null
        | undefined,
): boolean | null {
    if (!members) return null;
    const owners = members.filter((m) => (m.roleKey ?? m.role) === "OWNER");
    const me = owners.find((m) => m.isSelf);
    if (!me) return false;
    return owners.length === 1;
}

/** What the only owner reads where the button would be. */
export function onlyOwnerLine(business: string): string {
    return `You're the only owner of ${business}, and it always needs one. To leave, make someone else an owner first in Settings › Team.`;
}

export interface LeaveWords {
    title: string;
    description: string;
    confirmLabel: string;
    keepLabel: string;
}

/**
 * The confirm: what goes now, what stays, and that it can't be taken back.
 * `locations` are the locations they work at here, which they come off too.
 */
export function leaveWords(
    business: string,
    locations: readonly string[] = [],
): LeaveWords {
    const places =
        locations.length > 0
            ? ` You come off ${new Intl.ListFormat("en", {
                  type: "conjunction",
              }).format(locations)} too.`
            : "";
    return {
        title: `Leave ${business}?`,
        description: `You lose access to ${business} now, and any share links you made stop working.${places} Your work stays with the business, and nothing changes in your other businesses. To come back, someone there has to invite you again. This cannot be undone.`,
        confirmLabel: "Leave business",
        keepLabel: "Stay",
    };
}

/** Said when the API didn't word its own refusal. */
export const LEAVE_FAILED = "Couldn't leave the business. Try again.";
