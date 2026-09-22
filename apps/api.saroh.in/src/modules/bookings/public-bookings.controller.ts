import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Ip,
    Param,
    Post,
    Query,
} from "@nestjs/common";
import { createHash } from "node:crypto";

import type { Slot } from "./availability";
import type { PublicBooking, PublicService } from "./bookings.service";
import { BookingsService, toPublicBooking } from "./bookings.service";
import { BookServiceDto } from "./dto";

/** The section contract's cap on a services list (#255). */
const MAX_PUBLIC_SERVICE_IDS = 24;

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

    /**
     * The services a website's services list shows, `?ids=a,b,c`, in that
     * order (#255). Only services that may be offered come back; see
     * {@link BookingsService.publicServices}.
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
     *
     * Answers with the booker's own booking only — time, service, and the
     * link to join if it is online — never the stored row (ADR-007).
     */
    @Post(":serviceId/book")
    async book(
        @Param("serviceId") serviceId: string,
        @Body() dto: BookServiceDto,
        @Ip() ip: string,
    ): Promise<PublicBooking> {
        const ipHash = ip
            ? createHash("sha256").update(ip).digest("hex")
            : undefined;

        const booking = await this.bookings.book(
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
        return toPublicBooking(booking);
    }
}
