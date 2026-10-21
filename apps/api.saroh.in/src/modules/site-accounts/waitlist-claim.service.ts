import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { appointmentsOpen } from "../bookings/appointments-open";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { freePlacesInTx } from "../bookings/waitlist-offer";
import { siteCodeSecret } from "./site-secrets";
import type { ClaimState } from "./waitlist-claim";
import { claimState, mayRejoin, verifyClaimToken } from "./waitlist-claim";

/** What the claim page draws (`/book/claim/‹token›` on saroh.app). */
export interface PublicWaitlistClaim {
    state: ClaimState;
    business: string;
    serviceId: string;
    /** The class's name. */
    service: string;
    /** The session's start, ISO. */
    startAt: string;
    /** Until when the place is (or was) held for them, ISO. */
    heldUntil: string;
    /** The class's zone: the page says every time in it. */
    timezone: string;
    /** Places free for anyone now; 0 when the class is full. */
    placesLeft: number;
    /**
     * The page offers a way back into the class: join its line again, or
     * book a free place, through the booking page.
     */
    rejoin: boolean;
}

/** Reads per visitor per minute: a reload is fine, a scraper is not. */
const READS_PER_WINDOW = 30;
const READ_WINDOW_MS = 60_000;

/** Every miss looks the same: forged, unknown, another business's. */
function notFound(): never {
    throw new NotFoundException("Offer not found");
}

/**
 * The claim link's read (automatic notices U18): no session, so everything
 * hangs on the signed token and the site the page is on. The token names an
 * entry; the site names the business, and the entry is read only in that
 * business's RLS context, so a link opened on another business's site is
 * not found. Limited per visitor, like the site's other public reads.
 */
@Injectable()
export class WaitlistClaimService {
    constructor(
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    async read(
        siteId: string,
        token: string,
        visitor: string | undefined,
        now: Date = new Date(),
    ): Promise<PublicWaitlistClaim> {
        if (!this.limiter.take(visitor ?? "unknown")) {
            throw new HttpException(
                "Too many requests for this link. Try again shortly.",
                429,
            );
        }
        const claim = verifyClaimToken(siteCodeSecret(), token);
        if (!claim) notFound();
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                deletedAt: null,
                currentPublicationId: { not: null },
            },
            select: { organizationId: true },
        });
        if (!site) notFound();
        const organizationId = site.organizationId;
        const open = await appointmentsOpen(organizationId);
        return runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                const entry = await tx.classWaitlistEntry.findFirst({
                    where: { id: claim.entryId, organizationId },
                    select: {
                        contactId: true,
                        status: true,
                        startAt: true,
                        offeredUntil: true,
                        organization: { select: { name: true } },
                        service: {
                            select: {
                                id: true,
                                organizationId: true,
                                name: true,
                                status: true,
                                deletedAt: true,
                                capacity: true,
                                durationMinutes: true,
                                bufferBeforeMinutes: true,
                                bufferAfterMinutes: true,
                                timezone: true,
                            },
                        },
                    },
                });
                if (!entry) notFound();
                const service = entry.service;
                const [freeForThem, freeForAnyone] = await Promise.all([
                    freePlacesInTx(
                        tx,
                        service,
                        entry.startAt,
                        now,
                        entry.contactId,
                    ),
                    freePlacesInTx(tx, service, entry.startAt, now),
                ]);
                const facts = {
                    status: entry.status,
                    offeredUntil: entry.offeredUntil,
                    tokenUntil: claim.until,
                    startAt: entry.startAt,
                    offered:
                        open &&
                        service.status === "ACTIVE" &&
                        service.deletedAt === null,
                    freeForThem,
                };
                const state = claimState(facts, now);
                return {
                    state,
                    business: entry.organization.name,
                    serviceId: service.id,
                    service: service.name,
                    startAt: entry.startAt.toISOString(),
                    heldUntil: (
                        entry.offeredUntil ?? claim.until
                    ).toISOString(),
                    timezone: service.timezone,
                    placesLeft: Math.max(0, freeForAnyone),
                    rejoin: mayRejoin(state, facts),
                };
            }),
        );
    }
}
