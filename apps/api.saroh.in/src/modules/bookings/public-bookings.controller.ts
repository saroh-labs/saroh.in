import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Ip,
    Param,
    Post,
    Query,
} from "@nestjs/common";
import type { Booking } from "@saroh/database";

import { hashClientIp } from "../../common/client-ip";
import type { HoldState } from "./booking-hold";
import { holdState } from "./booking-hold";
import type { AvailableSlot } from "./booking-slots";
import { BookServiceDto } from "./dto";
import type {
    PublicBooking,
    PublicBookingPage,
    PublicDays,
    PublicService,
} from "./public-booking-page";
import { toPublicBooking } from "./public-booking-page";
import type { PublicHold, PublicStaff } from "./public-bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import type { PublicToday } from "./public-today";
import { PublicTodayService } from "./public-today";

/** The section contract's cap on a services list (#255). */
const MAX_PUBLIC_SERVICE_IDS = 24;

/**
 * PUBLIC booking API (S4-002), mounted at `/public/services` with NO guards —
 * this is what an anonymous visitor's booking page hits. There is deliberately
 * no `BetterAuthGuard`/`OrganizationGuard` and no `@OrgContext()`: no session,
 * no client-supplied org.
 *
 * The owning organization is derived entirely from the target Service inside
 * {@link PublicBookingsService}, so this unauthenticated endpoint can only ever create
 * rows in the org that owns the Service it targets. Mirrors the guardless
 * enquiry controller (S3-002).
 */
@Controller("public/services")
export class PublicBookingsController {
    constructor(private readonly bookings: PublicBookingsService) {}

    /**
     * The services a website's services list shows, `?ids=a,b,c`, in that
     * order (#255). Only services that may be offered come back; see
     * {@link PublicBookingsService.publicServices}.
     */
    @Get()
    services(@Query("ids") ids?: unknown): Promise<PublicService[]> {
        // `?ids=a&ids=b` arrives as an array; only one comma list is accepted.
        if (ids !== undefined && typeof ids !== "string") {
            throw new BadRequestException("ids must be a comma-separated list");
        }
        const list = [
            ...new Set(
                (ids ?? "")
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean),
            ),
        ];
        if (list.length > MAX_PUBLIC_SERVICE_IDS) {
            throw new BadRequestException(
                `At most ${MAX_PUBLIC_SERVICE_IDS} services at a time`,
            );
        }
        return this.bookings.publicServices(list);
    }

    /**
     * Open slots for a bookable service over `?from=&to=` (ISO instants),
     * optionally for one person (`?staffId=`). Inside the business's booking
     * rules; a person appears only as an opaque id (U3).
     */
    @Get(":serviceId/availability")
    availability(
        @Param("serviceId") serviceId: string,
        @Query("from") from: string,
        @Query("to") to: string,
        @Query("staffId") staffId?: string,
    ): Promise<AvailableSlot[]> {
        return this.bookings.publicAvailability(serviceId, from, to, staffId);
    }

    /**
     * The booking page's next two weeks for a service (U19): each day open or
     * not, with its free starts — or, for a class, every session with its
     * places left. People by display name and opaque id only.
     */
    @Get(":serviceId/days")
    @Header("Cache-Control", "no-store")
    days(@Param("serviceId") serviceId: string): Promise<PublicDays> {
        return this.bookings.publicDays(serviceId);
    }

    /**
     * Where a pay-now hold stands (U19), by the pay token its booking
     * answered with: what the page polls while its booker pays.
     */
    @Get("holds/:token")
    @Header("Cache-Control", "no-store")
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    hold(@Param("token") token: string, @Ip() ip: string): Promise<PublicHold> {
        return this.bookings.publicHold(token, hashClientIp(ip));
    }

    /** Let a pay-now hold go before its time (U19). */
    @Post("holds/:token/release")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    @Header("Referrer-Policy", "no-referrer")
    release(
        @Param("token") token: string,
        @Ip() ip: string,
    ): Promise<PublicHold> {
        return this.bookings.releasePublicHold(token, hashClientIp(ip));
    }

    /**
     * Who takes a service: a display name and an opaque id each (U3). Never
     * their hours, and never whether or why they are off.
     */
    @Get(":serviceId/staff")
    staff(@Param("serviceId") serviceId: string): Promise<PublicStaff[]> {
        return this.bookings.publicServiceStaff(serviceId);
    }

    /**
     * The ANONYMOUS booking route (U19): name and email typed on the page.
     *
     * Sign-in is always on (A9, ADR-011): the booking page books through
     * `POST public/site-accounts/bookings` now, and no site code calls this
     * any more (`apps/saroh.app/lib/no-anonymous-booking.test.ts` pins it).
     * It keeps serving for the release that moved the page, so a page
     * loaded before that deploy still books; the next release makes it
     * answer 410 "Sign in to book". Staff bookings are another route.
     *
     * Reserve a slot on `:serviceId`. The source IP (from `@Ip()`) is immediately
     * hashed (sha256) and only the hash is ever passed on — the raw IP never
     * leaves this handler.
     *
     * Answers with the booker's own booking only — time, service, and the
     * link to join if it is online — never the stored row (ADR-007).
     */
    @Post(":serviceId/book")
    async book(
        @Param("serviceId") serviceId: string,
        @Body() dto: BookServiceDto,
        @Ip() ip: string,
    ): Promise<PublicBookingResult> {
        const { booking, payToken } = await this.bookings.bookOnline(
            serviceId,
            {
                startAt: dto.startAt,
                bookerName: dto.bookerName,
                bookerEmail: dto.bookerEmail,
                bookerPhone: dto.bookerPhone,
                idempotencyKey: dto.idempotencyKey,
                staffId: dto.staffId,
                pay: dto.pay,
                locationType: dto.locationType,
                intakeNote: dto.intakeNote,
            },
            hashClientIp(ip),
        );
        return publicBookingResult(booking, payToken);
    }
}

/**
 * What a booking answers the booker with: their own booking, where it
 * stands, and for a pay-now hold the token that pays it. Shared by the
 * anonymous route and the signed-in one (A9).
 */
export function publicBookingResult(
    booking: Booking,
    payToken: string | null,
    now: Date = new Date(),
): PublicBookingResult {
    const state = holdState(booking, now);
    return {
        ...toPublicBooking(booking),
        state,
        // Who it is with, by name, and how it is paid — the booker's own
        // booking, so nothing here is anyone else's.
        holdExpiresAt:
            state === "HELD"
                ? (booking.holdExpiresAt?.toISOString() ?? null)
                : null,
        payToken,
    };
}

/**
 * The booker's own booking (ADR-007), where it stands (U19), and for a
 * pay-now hold the token that pays it and reads it — handed over this once.
 */
export type PublicBookingResult = PublicBooking & {
    state: HoldState;
    holdExpiresAt: string | null;
    payToken: string | null;
};

/**
 * The PUBLIC read of a site's booking page (U19), under `/public/sites` like
 * the site's other public reads — guardless, and only what a visitor may see:
 * the services it offers, who takes them by name, the booking rules.
 */
@Controller("public/sites")
export class PublicBookingPageController {
    constructor(
        private readonly bookings: PublicBookingsService,
        private readonly today: PublicTodayService,
    ) {}

    @Get(":siteId/booking")
    @Header("Cache-Control", "no-store")
    page(@Param("siteId") siteId: string): Promise<PublicBookingPage> {
        return this.bookings.publicBookingPage(siteId);
    }

    /**
     * "On today" on the site's home page (G18): up to four of today's
     * classes and free times, as the booking page offers them, and the
     * business's hours and zone for "Open now · closes 9pm". Read live, so
     * never cached; limited per visitor. The source IP is hashed here and
     * only the hash is passed on.
     */
    @Get(":siteId/today")
    @Header("Cache-Control", "no-store")
    todayOn(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
    ): Promise<PublicToday> {
        return this.today.read(siteId, hashClientIp(ip));
    }
}
