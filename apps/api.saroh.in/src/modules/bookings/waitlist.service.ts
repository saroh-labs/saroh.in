import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { isSerializationFailure } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import { contactEmailForDisplay } from "../contacts/contact-email";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import type { NoticeReach } from "../site-accounts/notice-reach";
import { contactReach } from "../site-accounts/notice-reach";
import { isValidSlotStart } from "./availability";
import { requireBookingPower } from "./booking-access";
import { refuseIfClosed, toAvailabilityService } from "./booking-slots";
import { openingFor, refuseOutsideOpening } from "./opening-hours";
import type { SignedInCustomer } from "./public-bookings.service";
import {
    alreadyBooked,
    holdsSlotAlready,
    loadBookableService,
} from "./reservation";
import { freePlacesInTx, sessionEnd } from "./waitlist-offer";
import { offerFreedPlaceInTx } from "./waitlist-queue";
import { MAX_LIVE_ENTRIES, mayOffer, WAITLIST_WORDS } from "./waitlist-rules";

/**
 * The class waitlist's reads and writes (round-2 A12, R13): a signed-in
 * customer joins or leaves the line for one full session from the booking
 * page, and the team reads a class's line in order.
 *
 * Only a signed-in customer joins (sign-in is always on, A9): the entry is
 * their account's contact, as a booking is. A session with a place free is
 * booked, not waited for ("There's room — book it", 409), and one account
 * holds at most ten places in line (default 9's companion, plan A12).
 * Offering freed places is `waitlist-offer.ts`'s.
 */

/** A place in line, as the customer who holds it sees it. */
export interface PublicWaitlistPlace {
    startAt: string;
    status: "WAITING" | "OFFERED";
    /** 1 is next. Null once a place is held for them. */
    placeInLine: number | null;
    /** While OFFERED: until when the place is held for them. */
    offeredUntil: string | null;
}

/** Joined: the place, and how they will hear a place is theirs. */
export interface WaitlistJoined extends PublicWaitlistPlace {
    reach: NoticeReach;
}

/** One person in a class's line, for the team (`booking:read`). */
export interface WaitlistRosterRow {
    id: string;
    contactId: string;
    name: string | null;
    email: string | null;
    status: "WAITING" | "OFFERED";
    offeredUntil: string | null;
    joinedAt: string;
}

type Tx = Prisma.TransactionClient;
interface EntryRow {
    id: string;
    startAt: Date;
    status: string;
    position: number;
    offeredUntil: Date | null;
}

const LIVE = ["WAITING", "OFFERED"] as const;

@Injectable()
export class WaitlistService {
    /**
     * Join the line for one full session. Idempotent: a place already held
     * is answered as it stands. Refused when a place is free (book it),
     * when they already hold the session, inside the hour before it, or
     * past ten places in line.
     */
    async join(
        customer: SignedInCustomer,
        serviceId: string,
        startAtISO: string,
        now: Date = new Date(),
    ): Promise<WaitlistJoined> {
        const { service, rules } = await loadBookableService(serviceId, {
            bookingPage: true,
        });
        if (service.organizationId !== customer.organizationId) {
            throw new NotFoundException("Service not found");
        }
        await assertOrganizationOpen(service.organizationId);
        if (service.capacity <= 1) {
            throw new BadRequestException(WAITLIST_WORDS.notClass);
        }
        const startAt = new Date(startAtISO);
        if (
            Number.isNaN(startAt.getTime()) ||
            !isValidSlotStart(toAvailabilityService(service), rules, startAt)
        ) {
            throw new BadRequestException(WAITLIST_WORDS.noSession);
        }
        await refuseIfClosed(
            service.organizationId,
            startAt,
            sessionEnd(service, startAt),
        );
        // An in-person class keeps to opening hours (DEC-087). One offered
        // either way may still be had online, so its line is not refused.
        refuseOutsideOpening(await openingFor(service, "ONLINE"), {
            startAt,
            endAt: sessionEnd(service, startAt),
        });
        if (!mayOffer(startAt, now)) {
            throw new ConflictException({
                message: WAITLIST_WORDS.tooLate,
                details: { reason: "too-late" },
            });
        }
        const organizationId = service.organizationId;

        let entry: EntryRow & { contactId: string };
        try {
            entry = await prisma.$transaction(
                async (tx) => {
                    // The lock the offer job takes: a join and an offer
                    // for this service queue behind each other.
                    await tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${service.id} FOR UPDATE`;
                    const contact = await resolveContact(
                        tx,
                        customer.contactId,
                        organizationId,
                    );
                    if (!contact || contact.removed) {
                        throw new UnauthorizedException({
                            message: "Sign in to continue.",
                            details: { reason: "signed-out" },
                        });
                    }
                    const session = { serviceId: service.id, startAt };
                    const live = await tx.classWaitlistEntry.findFirst({
                        where: {
                            ...session,
                            contactId: contact.id,
                            status: { in: [...LIVE] },
                        },
                        select: ENTRY_SELECT,
                    });
                    if (live) return live;
                    if (
                        await holdsSlotAlready(
                            tx,
                            organizationId,
                            {
                                accountId: customer.accountId,
                                contactId: contact.id,
                            },
                            service.id,
                            startAt,
                            now,
                        )
                    ) {
                        throw alreadyBooked();
                    }
                    if ((await freePlacesInTx(tx, service, startAt, now)) > 0) {
                        throw new ConflictException({
                            message: WAITLIST_WORDS.room,
                            details: { reason: "room" },
                        });
                    }
                    const held = await tx.classWaitlistEntry.count({
                        where: {
                            organizationId,
                            contactId: contact.id,
                            status: { in: [...LIVE] },
                            startAt: { gt: now },
                        },
                    });
                    if (held >= MAX_LIVE_ENTRIES) {
                        throw new ConflictException({
                            message: WAITLIST_WORDS.tooMany,
                            details: { reason: "too-many" },
                        });
                    }
                    const last = await tx.classWaitlistEntry.aggregate({
                        where: session,
                        _max: { position: true },
                    });
                    return tx.classWaitlistEntry.create({
                        data: {
                            organizationId,
                            ...session,
                            endAt: sessionEnd(service, startAt),
                            contactId: contact.id,
                            customerAccountId: customer.accountId,
                            position: (last._max.position ?? 0) + 1,
                        },
                        select: ENTRY_SELECT,
                    });
                },
                { isolationLevel: "Serializable" },
            );
        } catch (err) {
            if (isSerializationFailure(err)) {
                throw new ConflictException(
                    "That changed while you were joining. Try again.",
                );
            }
            throw err;
        }
        const [view, reach] = await Promise.all([
            placeView(prisma, service.id, entry, now),
            contactReach(prisma, organizationId, entry.contactId),
        ]);
        return { ...view, reach };
    }

    /**
     * Leave the line for one session. A place held for them goes to the
     * next in line (`waitlist.offer`). Leaving a line they aren't in is
     * not an error.
     */
    async leave(
        customer: SignedInCustomer,
        serviceId: string,
        startAtISO: string,
        now: Date = new Date(),
    ): Promise<{ left: boolean }> {
        const startAt = new Date(startAtISO);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException(WAITLIST_WORDS.noSession);
        }
        const organizationId = customer.organizationId;
        const left = await prisma.$transaction(async (tx) => {
            const contact = await resolveContact(
                tx,
                customer.contactId,
                organizationId,
            );
            if (!contact) return false;
            const live = await tx.classWaitlistEntry.findFirst({
                where: {
                    organizationId,
                    serviceId,
                    startAt,
                    contactId: contact.id,
                    status: { in: [...LIVE] },
                },
                select: { id: true, status: true, offeredUntil: true },
            });
            if (!live) return false;
            await tx.classWaitlistEntry.update({
                where: { id: live.id },
                data: { status: "LEFT", closedAt: now },
                select: { id: true },
            });
            // The place held for them is free for the next in line.
            if (
                live.status === "OFFERED" &&
                live.offeredUntil &&
                live.offeredUntil > now
            ) {
                await offerFreedPlaceInTx(tx, {
                    organizationId,
                    serviceId,
                    startAt,
                });
            }
            return true;
        });
        return { left };
    }

    /**
     * The customer's places in line for one service's classes still to
     * come: waiting, or held for them while the offer lasts.
     */
    async mine(
        customer: SignedInCustomer,
        serviceId: string,
        now: Date = new Date(),
    ): Promise<{ places: PublicWaitlistPlace[] }> {
        const rows = await prisma.classWaitlistEntry.findMany({
            where: {
                organizationId: customer.organizationId,
                serviceId,
                contactId: customer.contactId,
                startAt: { gt: now },
                OR: [
                    { status: "WAITING" },
                    { status: "OFFERED", offeredUntil: { gt: now } },
                ],
            },
            orderBy: { startAt: "asc" },
            select: ENTRY_SELECT,
        });
        return {
            places: await Promise.all(
                rows.map((row) => placeView(prisma, serviceId, row, now)),
            ),
        };
    }

    /**
     * A class's line, for the team (`booking:read`): a place held for
     * someone first, then everyone waiting, first in line first.
     */
    async roster(
        ctx: OrganizationContext,
        serviceId: string,
        startAtISO: string,
        now: Date = new Date(),
    ): Promise<{ rows: WaitlistRosterRow[] }> {
        requireBookingPower(ctx, "booking:read");
        const startAt = new Date(startAtISO);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        const service = await prisma.service.findFirst({
            where: { id: serviceId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!service) throw new NotFoundException("Service not found");
        const rows = await prisma.classWaitlistEntry.findMany({
            where: {
                organizationId: ctx.organizationId,
                serviceId,
                startAt,
                OR: [
                    { status: "WAITING" },
                    { status: "OFFERED", offeredUntil: { gt: now } },
                ],
            },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
                id: true,
                contactId: true,
                status: true,
                offeredUntil: true,
                createdAt: true,
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
                customerAccount: { select: { email: true } },
            },
        });
        const offered = rows.filter((r) => r.status === "OFFERED");
        const waiting = rows.filter((r) => r.status === "WAITING");
        return {
            rows: [...offered, ...waiting].map((r) => ({
                id: r.id,
                contactId: r.contactId,
                name:
                    [r.contact.firstName, r.contact.lastName]
                        .map((p) => p?.trim() ?? "")
                        .filter(Boolean)
                        .join(" ") || null,
                email: contactEmailForDisplay(
                    r.contact.email,
                    r.customerAccount?.email,
                ),
                status: r.status === "OFFERED" ? "OFFERED" : "WAITING",
                offeredUntil: r.offeredUntil?.toISOString() ?? null,
                joinedAt: r.createdAt.toISOString(),
            })),
        };
    }
}

const ENTRY_SELECT = {
    id: true,
    contactId: true,
    startAt: true,
    status: true,
    position: true,
    offeredUntil: true,
} satisfies Prisma.ClassWaitlistEntrySelect;

/** A place in line as its holder reads it, with where they stand. */
async function placeView(
    db: Pick<Tx, "classWaitlistEntry">,
    serviceId: string,
    entry: EntryRow,
    now: Date,
): Promise<PublicWaitlistPlace> {
    const offered =
        entry.status === "OFFERED" &&
        entry.offeredUntil !== null &&
        entry.offeredUntil > now;
    const ahead = offered
        ? 0
        : await db.classWaitlistEntry.count({
              where: {
                  serviceId,
                  startAt: entry.startAt,
                  status: "WAITING",
                  position: { lt: entry.position },
              },
          });
    return {
        startAt: entry.startAt.toISOString(),
        status: offered ? "OFFERED" : "WAITING",
        placeInLine: offered ? null : ahead + 1,
        offeredUntil: offered
            ? (entry.offeredUntil?.toISOString() ?? null)
            : null,
    };
}
