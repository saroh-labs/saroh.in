import type { Prisma } from "@saroh/database";

import { offerFreedPlaceInTx } from "./waitlist-queue";

/**
 * What a merge of two customers does with their places in line (C9's rule
 * for `ClassWaitlistEntry`, round-2 A12), on the merge's transaction.
 *
 * - Different classes: the merged-away person's places move to the
 *   survivor.
 * - The same class, both in line: the better place stays — a place held
 *   for them (OFFERED, still running) over one waiting, else the earlier
 *   position. The other is CLOSED. Two held places were two places: the
 *   one given up goes to the next in line (`waitlist.offer`).
 * - The survivor already holds the class (booked, or a pay-now hold): the
 *   merged-away person's place in its line is CLOSED, and a place held for
 *   them goes to the next in line.
 *
 * Returns how many places moved. {@link removeWaitlistInTx} is a privacy
 * removal's rule (C11): their places go, and a held one passes on.
 */

type Tx = Prisma.TransactionClient;

interface Live {
    id: string;
    serviceId: string;
    startAt: Date;
    status: string;
    position: number;
    offeredUntil: Date | null;
}

function held(entry: Live, now: Date): boolean {
    return (
        entry.status === "OFFERED" &&
        entry.offeredUntil !== null &&
        entry.offeredUntil > now
    );
}

/** Whether `a` is the better place in one line than `b`. */
export function betterPlace(a: Live, b: Live, now: Date): boolean {
    if (held(a, now) !== held(b, now)) return held(a, now);
    return a.position < b.position;
}

export async function mergeWaitlistInTx(
    tx: Tx,
    input: { organizationId: string; from: string; to: string; now: Date },
): Promise<number> {
    const { organizationId, from, to, now } = input;
    const select = {
        id: true,
        serviceId: true,
        startAt: true,
        status: true,
        position: true,
        offeredUntil: true,
    } as const;
    const live: Prisma.ClassWaitlistEntryWhereInput = {
        status: { in: ["WAITING", "OFFERED"] },
    };
    const [theirs, ours] = await Promise.all([
        tx.classWaitlistEntry.findMany({
            where: { organizationId, contactId: from, ...live },
            select,
        }),
        tx.classWaitlistEntry.findMany({
            where: { organizationId, contactId: to, ...live },
            select,
        }),
    ]);
    const key = (e: Live) => `${e.serviceId}|${e.startAt.toISOString()}`;
    const survivorLine = new Map(ours.map((e) => [key(e), e]));

    const close = async (entry: Live) => {
        await tx.classWaitlistEntry.update({
            where: { id: entry.id },
            data: { status: "CLOSED", closedAt: now },
            select: { id: true },
        });
        if (held(entry, now)) {
            await offerFreedPlaceInTx(tx, {
                organizationId,
                serviceId: entry.serviceId,
                startAt: entry.startAt,
            });
        }
    };

    for (const entry of theirs) {
        const same = survivorLine.get(key(entry));
        if (same) {
            // One place in one line: the better one stays.
            await close(betterPlace(entry, same, now) ? same : entry);
            continue;
        }
        const booked = await tx.booking.count({
            where: {
                organizationId,
                contactId: to,
                serviceId: entry.serviceId,
                startAt: entry.startAt,
                OR: [
                    { status: "CONFIRMED" },
                    { status: "PENDING", holdExpiresAt: { gt: now } },
                ],
            },
        });
        if (booked > 0) await close(entry);
    }
    const { count } = await tx.classWaitlistEntry.updateMany({
        where: { organizationId, contactId: from },
        data: { contactId: to },
    });
    return count;
}

/**
 * A privacy removal (C11's rule for `ClassWaitlistEntry`, A12): every place
 * in line the person holds is deleted, and a place held for them is offered
 * to the next in line (`waitlist.offer`). Returns how many went.
 */
export async function removeWaitlistInTx(
    tx: Tx,
    input: { organizationId: string; contactId: string; now: Date },
): Promise<number> {
    const { organizationId, contactId, now } = input;
    const heldPlaces = await tx.classWaitlistEntry.findMany({
        where: {
            organizationId,
            contactId,
            status: "OFFERED",
            offeredUntil: { gt: now },
        },
        select: { serviceId: true, startAt: true },
    });
    const { count } = await tx.classWaitlistEntry.deleteMany({
        where: { organizationId, contactId },
    });
    for (const held of heldPlaces) {
        await offerFreedPlaceInTx(tx, { organizationId, ...held });
    }
    return count;
}
