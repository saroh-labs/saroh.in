import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { BOOKABLE_STAFF } from "../billing/seats";
import { CALENDAR_ONLY_ROLE_KEY } from "./calendar-only-role";

export { countedOnDiary } from "../billing/seats";

/**
 * Giving a login to someone on the diary (#868; owner decision
 * 2026-10-08).
 *
 * Someone taking bookings with no login (DEC-105) already uses a team
 * seat. An invite that names them (`staffId`) asks them in as that person:
 * by default as Calendar only — their own diary, nothing else — though the
 * owner may pick any role they could give anyway. Accepting links the diary
 * person to the new membership, so their bookings, hours and seat become
 * the login's.
 *
 * While it is open the invite is the same person as the diary entry, so
 * it is counted once, as them ({@link countedOnDiary}). Linking an existing
 * team member to a diary person changes nobody's role: a role someone
 * holds is never lowered or replaced (the Storefront team rule, DEC-048).
 */

/** A diary person as an invite reads them. */
export interface DiaryPerson {
    id: string;
    name: string;
    status: string;
    membershipId: string | null;
}

/** The role an invite asks for: the one picked, else Calendar only for a diary person. */
export function inviteRoleFor(input: {
    role?: string | null;
    staffId?: string | null;
}): string {
    const picked = input.role?.trim();
    if (picked) return picked;
    if (input.staffId) return CALENDAR_ONLY_ROLE_KEY;
    throw new BadRequestException({ message: "Choose a role", field: "role" });
}

/** Why this diary person can't be given a login by invite, or null. */
export function diaryInviteRefusal(
    person: DiaryPerson | null,
    otherInviteFor: string | null,
): { message: string; field: string } | null {
    if (!person) {
        return { message: "That person isn't on the diary.", field: "staffId" };
    }
    if (person.membershipId) {
        return {
            message: `${person.name} already has a login here.`,
            field: "staffId",
        };
    }
    if (otherInviteFor) {
        return {
            message: `${person.name} already has an invite waiting, sent to ${otherInviteFor}. Resend or cancel it from the list.`,
            field: "staffId",
        };
    }
    return null;
}

/** Refuse, in words, an invite for a diary person that can't be sent. */
export function assertDiaryInvitable(
    person: DiaryPerson | null,
    otherInviteFor: string | null,
): void {
    const refusal = diaryInviteRefusal(person, otherInviteFor);
    if (!refusal) return;
    throw person && !person.membershipId
        ? new ConflictException(refusal)
        : new BadRequestException(refusal);
}

/**
 * Link the diary person an accepted invite names to the new membership, in
 * the accept's transaction. Only someone still without a login is linked,
 * and a membership already on the diary as someone keeps that: two diary
 * people can't share a login. True when they are linked.
 */
export async function linkDiaryPerson(
    tx: Pick<Prisma.TransactionClient, "staffMember">,
    organizationId: string,
    staffId: string,
    membershipId: string,
): Promise<boolean> {
    const already = await tx.staffMember.findUnique({
        where: { membershipId },
        select: { id: true },
    });
    if (already) return already.id === staffId;
    const { count } = await tx.staffMember.updateMany({
        where: { id: staffId, organizationId, membershipId: null },
        data: { membershipId },
    });
    return count === 1;
}

/** Whether the person an invite names will take bookings once they join. */
export function joinsBookable(
    staff: { status: string } | null | undefined,
): boolean {
    return staff?.status === BOOKABLE_STAFF;
}
