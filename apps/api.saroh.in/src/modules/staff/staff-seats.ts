import type { Prisma } from "@saroh/database";

import { BOOKABLE_STAFF, roleActionsOf, seatOf } from "../billing/seats";

/** A person on the diary as far as seats go: taking bookings, and who. */
export interface DiaryState {
    status: string;
    membershipId: string | null;
}

/** A team member a diary change touches, with what decides their seat. */
export interface DiaryMember {
    id: string;
    role: string;
    extraActions: string[];
}

/**
 * The team seats a person on the diary holds together with the members it
 * touches (DEC-105, UX-053): someone taking bookings with no login uses a
 * seat of their own; one who is a team member is counted once, through
 * their membership, which taking bookings puts on a seat whatever the role.
 */
function seatsHeld(
    state: DiaryState | null,
    members: readonly DiaryMember[],
    roles: readonly { key: string; actions: string[] }[],
): number {
    const lookup = roleActionsOf(roles);
    const bookable = state?.status === BOOKABLE_STAFF;
    let seats = bookable && state.membershipId === null ? 1 : 0;
    for (const m of members) {
        const takes = bookable && state.membershipId === m.id;
        if (seatOf(lookup, m.role, m.extraActions, takes) === "seat") {
            seats += 1;
        }
    }
    return seats;
}

/**
 * How many team seats a diary write adds (0 or less when it frees one):
 * adding someone, bringing them back from archived, or linking or
 * unlinking their login. `before` is null for someone new.
 */
export function diarySeatDelta(
    before: DiaryState | null,
    after: DiaryState,
    members: readonly DiaryMember[],
    roles: readonly { key: string; actions: string[] }[],
): number {
    return seatsHeld(after, members, roles) - seatsHeld(before, members, roles);
}

/**
 * {@link diarySeatDelta}, reading the members either side links to and the
 * business's own roles on the write's transaction.
 */
export async function diarySeatsAdded(
    tx: Pick<Prisma.TransactionClient, "membership" | "organizationRole">,
    organizationId: string,
    before: DiaryState | null,
    after: DiaryState,
): Promise<number> {
    const ids = [before?.membershipId, after.membershipId].filter(
        (id): id is string => typeof id === "string",
    );
    const [members, roles] = await Promise.all([
        ids.length > 0
            ? tx.membership.findMany({
                  where: { organizationId, id: { in: [...new Set(ids)] } },
                  select: { id: true, role: true, extraActions: true },
              })
            : Promise.resolve([]),
        tx.organizationRole.findMany({
            where: { organizationId },
            select: { key: true, actions: true },
        }),
    ]);
    return diarySeatDelta(before, after, members, roles);
}
