/**
 * Who uses a team seat (DEC-155): every person in the business, whatever
 * their role. One seat each for
 *
 * - every team member (a `Membership`): Owner, Admin, Member, Reviewer and
 *   any role the business made, whether it changes things or only looks;
 * - every invitation still open, at any role;
 * - everyone on the diary who takes bookings with no login (DEC-111).
 *
 * Nobody is counted apart: there is no free or separate allowance for
 * Reviewers or other people who only look (that was DEC-105, until 13 Oct
 * 2026). So a change of role, of a role's permissions or of someone's
 * extras never changes the count.
 */

/** A diary person who takes bookings (`StaffMember.status`). */
export const BOOKABLE_STAFF = "ACTIVE";

/**
 * Whether an open invite is already counted as the diary person it names
 * (#868): they take bookings with no login, so they hold a seat of their
 * own (`metering.ts`, `loginlessStaff`), and the invite is them, not one
 * more. Counting it again would leave a team at its cap unable to give
 * someone already on it a login.
 */
export function countedOnDiary(
    staff: { status: string; membershipId: string | null } | null | undefined,
): boolean {
    return staff?.status === BOOKABLE_STAFF && staff.membershipId === null;
}
