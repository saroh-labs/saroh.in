import { countedOnDiary } from "../billing/seats";

/** A person on the diary as far as seats go: taking bookings, and who. */
export interface DiaryState {
    status: string;
    membershipId: string | null;
}

/**
 * The team seat a person on the diary holds of their own (DEC-111,
 * UX-053): one while they take bookings with no login. One who is a team
 * member is counted through their membership, which is a seat whatever
 * their role (DEC-155), so the diary adds nothing for them.
 */
function seatsHeld(state: DiaryState | null): number {
    return countedOnDiary(state) ? 1 : 0;
}

/**
 * How many team seats a diary write adds (0 or less when it frees one):
 * adding someone, bringing them back from archived, or linking or
 * unlinking their login. `before` is null for someone new.
 */
export function diarySeatDelta(
    before: DiaryState | null,
    after: DiaryState,
): number {
    return seatsHeld(after) - seatsHeld(before);
}
