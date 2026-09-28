import type { Prisma, Service } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { resolveContact } from "../customer-workspace/resolve-contact";
import { enqueueCustomerNotice } from "../site-accounts/customer-notify-queue";
import { guarded } from "./availability";
import { holdsPlace } from "./booking-hold";
import { seatsHeld } from "./held-seats";
import { offerFreedPlaceInTx } from "./waitlist-queue";
import { mayOffer, offeredUntil } from "./waitlist-rules";

/**
 * Offering a freed place in a class to the first in line (round-2 A12,
 * R13; default 9). Plain functions on the caller's transaction: the
 * `waitlist.offer` job runs {@link offerSessionInTx}, joining counts with
 * {@link freePlacesInTx}, and the hold sweep ends offers nobody answered
 * ({@link expireLapsedOffers}).
 *
 * An offer holds the place the way a pay-now hold does: counted as taken
 * while `offeredUntil` is ahead (`held-seats.ts`), so the desk and the
 * booking page can't take it, and free again the moment it passes. The
 * person offered it books it through the normal path — a credit, paying
 * now, or at the desk — and that booking accepts it (`acceptWaitlistInTx`).
 */

type Tx = Prisma.TransactionClient;

type SessionService = Pick<
    Service,
    | "id"
    | "organizationId"
    | "capacity"
    | "durationMinutes"
    | "bufferBeforeMinutes"
    | "bufferAfterMinutes"
    | "timezone"
>;

/** A session's end: its start and the class's length. */
export function sessionEnd(
    service: Pick<Service, "durationMinutes">,
    startAt: Date,
): Date {
    return new Date(startAt.getTime() + service.durationMinutes * 60_000);
}

/**
 * Places free in a session now: its capacity less the bookings holding a
 * place and what courses and live offers hold — counted over the slot and
 * its buffers, as the reservation counts it (DEC-052). `exceptContactId`
 * leaves that person's own offer out.
 */
export async function freePlacesInTx(
    tx: Tx,
    service: SessionService,
    startAt: Date,
    now: Date,
    exceptContactId?: string | null,
): Promise<number> {
    const clear = guarded(
        { startAt, endAt: sessionEnd(service, startAt) },
        service,
    );
    const [booked, held] = await Promise.all([
        tx.booking.count({
            where: {
                serviceId: service.id,
                ...holdsPlace(now),
                startAt: { lt: clear.endAt },
                endAt: { gt: clear.startAt },
            },
        }),
        seatsHeld(tx, service.id, clear.startAt, clear.endAt, {
            now,
            exceptContactId,
        }),
    ]);
    return service.capacity - booked - held;
}

/** The key that makes an offer's notice once-only: one per entry. */
export function waitlistNoticeKey(entryId: string): string {
    return `waitlist:${entryId}`;
}

/**
 * Offer what is free in one session, first in line first. Offers that ran
 * out unanswered are ended first (EXPIRED), so their places count as free.
 * Nothing is offered inside the hour before the class (default 76).
 *
 * Each offer holds the place until {@link offeredUntil}, queues its notice
 * (`customer.notify`, WAITLIST_OFFER, once per entry) and queues this job
 * again for when it runs out, so the next person is offered it then. A
 * contact removed since they joined is taken out of the line (CLOSED).
 * Returns the entries offered now.
 */
export async function offerSessionInTx(
    tx: Tx,
    service: SessionService,
    startAt: Date,
    now: Date,
): Promise<string[]> {
    const organizationId = service.organizationId;
    const session = { serviceId: service.id, startAt };
    await tx.classWaitlistEntry.updateMany({
        where: {
            ...session,
            status: "OFFERED",
            offeredUntil: { lte: now },
        },
        data: { status: "EXPIRED", closedAt: now },
    });
    if (!mayOffer(startAt, now)) return [];
    let free = await freePlacesInTx(tx, service, startAt, now);
    if (free <= 0) return [];

    const until = offeredUntil(startAt, now);
    const offered: string[] = [];
    const line = await tx.classWaitlistEntry.findMany({
        where: { ...session, status: "WAITING" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, contactId: true },
    });
    for (const entry of line) {
        if (free <= 0) break;
        // A merged-away contact is their survivor; a removed one leaves
        // the line (C9, C11).
        const contact = await resolveContact(
            tx,
            entry.contactId,
            organizationId,
        );
        if (!contact || contact.removed) {
            await tx.classWaitlistEntry.update({
                where: { id: entry.id },
                data: { status: "CLOSED", closedAt: now },
                select: { id: true },
            });
            continue;
        }
        await tx.classWaitlistEntry.update({
            where: { id: entry.id },
            data: { status: "OFFERED", offeredAt: now, offeredUntil: until },
            select: { id: true },
        });
        await enqueueCustomerNotice(tx, organizationId, {
            kind: "WAITLIST_OFFER",
            eventKey: waitlistNoticeKey(entry.id),
            waitlistEntryId: entry.id,
        });
        offered.push(entry.id);
        free -= 1;
    }
    // When these run out unanswered, the next in line is offered them.
    if (offered.length > 0) {
        await offerFreedPlaceInTx(tx, {
            organizationId,
            ...session,
            runAt: until,
        });
    }
    return offered;
}

/** Offers ended per sweep run; past that, the next run takes the rest. */
export const EXPIRE_BATCH = 200;

/**
 * The hold sweep's part (A12): offers whose time ran out unanswered are
 * ended, and each session they were in is offered again. The offer's own
 * delayed job normally does this first; the sweep catches one that never
 * ran. Each session in its own business's RLS context and transaction; a
 * failing one is left for the next run. Returns how many were ended.
 */
export async function expireLapsedOffers(now: Date): Promise<number> {
    const lapsed = await prisma.classWaitlistEntry.findMany({
        where: { status: "OFFERED", offeredUntil: { lte: now } },
        orderBy: { offeredUntil: "asc" },
        take: EXPIRE_BATCH,
        select: { organizationId: true, serviceId: true, startAt: true },
    });
    const sessions = new Map<string, (typeof lapsed)[number]>();
    for (const row of lapsed) {
        sessions.set(`${row.serviceId}|${row.startAt.toISOString()}`, row);
    }
    let ended = 0;
    for (const s of sessions.values()) {
        ended += await runInOrgContext(s.organizationId, () =>
            prisma.$transaction(async (tx) => {
                const { count } = await tx.classWaitlistEntry.updateMany({
                    where: {
                        serviceId: s.serviceId,
                        startAt: s.startAt,
                        status: "OFFERED",
                        offeredUntil: { lte: now },
                    },
                    data: { status: "EXPIRED", closedAt: now },
                });
                if (count > 0 && mayOffer(s.startAt, now)) {
                    await offerFreedPlaceInTx(tx, s);
                }
                return count;
            }),
        );
    }
    return ended;
}

/** How long a closed place in line is kept before the cleanup (default 74). */
export const CLOSED_KEPT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Delete places in line closed more than 30 days ago, and any whose class
 * ended more than 30 days ago — one still WAITING when its class began was
 * never offered a place, and is over too (default 74).
 */
export async function deleteOldEntries(now: Date): Promise<number> {
    const before = new Date(now.getTime() - CLOSED_KEPT_MS);
    const { count } = await prisma.classWaitlistEntry.deleteMany({
        where: {
            OR: [{ closedAt: { lt: before } }, { endAt: { lt: before } }],
        },
    });
    return count;
}
