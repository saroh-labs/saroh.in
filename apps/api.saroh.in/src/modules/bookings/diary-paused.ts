import { overLimit } from "../billing/over-limit.service";

/**
 * People on the diary with no login who are past the team limit after a
 * move to a lower plan (#800, `billing/over-limit.ts`): they take no new
 * bookings — not on the booking page, not booked by hand, not in a slot
 * the engine offers. Bookings already made with them are kept and still
 * show on the diary; nothing is cancelled. Nothing is paused with
 * `PLAN_ENFORCEMENT` off, off the catalogue, or under the limit
 * (`pausedNow` is null), and it fails open as `pausedNow` does.
 */

const NONE: ReadonlySet<string> = new Set();

/** The staff ids of the diary people the plan has paused now. */
export async function pausedDiaryIds(
    organizationId: string,
): Promise<ReadonlySet<string>> {
    const paused = await overLimit.pausedNow(organizationId);
    return paused?.diaryIds ?? NONE;
}

/** Split people into who takes bookings and who the plan has paused. Pure. */
export function splitPaused<T extends { id: string }>(
    people: readonly T[],
    paused: ReadonlySet<string>,
): { taking: T[]; paused: T[] } {
    const taking: T[] = [];
    const out: T[] = [];
    for (const person of people) {
        (paused.has(person.id) ? out : taking).push(person);
    }
    return { taking, paused: out };
}

/**
 * Whether a service has people and every one of them is paused: nobody is
 * left to take it, so it offers nothing (rather than falling back to the
 * service's own hours, as a service nobody takes does).
 */
export function nobodyTaking(staffing: {
    people: readonly unknown[];
    paused?: readonly unknown[];
}): boolean {
    return staffing.people.length === 0 && (staffing.paused?.length ?? 0) > 0;
}
