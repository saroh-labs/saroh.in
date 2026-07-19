import { Body, Controller, Get, Ip, Param, Post, Query } from "@nestjs/common";
import type { Booking } from "@saroh/database";
import { createHash } from "node:crypto";

import type { Slot } from "./availability";
import { BookingsService } from "./bookings.service";
import { BookServiceDto } from "./dto";

/**
 * PUBLIC booking API (S4-002), mounted at `/public/services` with NO guards —
 * this is what an anonymous visitor's booking page hits. There is deliberately
 * no `BetterAuthGuard`/`OrganizationGuard` and no `@OrgContext()`: no session,
 * no client-supplied org.
 *
 * The owning organization is derived entirely from the target Service inside
 * {@link BookingsService}, so this unauthenticated endpoint can only ever create
 * rows in the org that owns the Service it targets. Mirrors the guardless
 * enquiry controller (S3-002).
 */
@Controller("public/services")
export class PublicBookingsController {
    constructor(private readonly bookings: BookingsService) {}

    /** Open slots for a bookable service over `?from=&to=` (ISO instants). */
    @Get(":serviceId/availability")
    availability(
        @Param("serviceId") serviceId: string,
        @Query("from") from: string,
        @Query("to") to: string,
    ): Promise<Slot[]> {
        return this.bookings.publicAvailability(serviceId, from, to);
    }

    /**
     * Reserve a slot on `:serviceId`. The source IP (from `@Ip()`) is immediately
     * hashed (sha256) and only the hash is ever passed on — the raw IP never
     * leaves this handler.
     */
    @Post(":serviceId/book")
    book(
        @Param("serviceId") serviceId: string,
        @Body() dto: BookServiceDto,
        @Ip() ip: string,
    ): Promise<Booking> {
        const ipHash = ip
            ? createHash("sha256").update(ip).digest("hex")
            : undefined;

        return this.bookings.book(
            serviceId,
            {
                startAt: dto.startAt,
                bookerName: dto.bookerName,
                bookerEmail: dto.bookerEmail,
                bookerPhone: dto.bookerPhone,
                idempotencyKey: dto.idempotencyKey,
            },
            ipHash,
        );
    }
}
