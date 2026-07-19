import {
    BadRequestException,
    ConflictException,
    GoneException,
    HttpException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import { IANAZone } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type {
    AvailabilityRuleWindow,
    AvailabilityService,
    Interval,
    Slot,
} from "./availability";
import { availableSlots, isValidSlotStart } from "./availability";
import type {
    AvailabilityRuleDto,
    CreateServiceDto,
    UpdateServiceDto,
} from "./dto";
import { FixedWindowRateLimiter } from "./rate-limiter";

/** The validated public booking command input (see {@link BookServiceDto}). */
export interface BookInput {
    startAt: string;
    bookerName?: string;
    bookerEmail: string;
    bookerPhone?: string;
    idempotencyKey?: string;
}

/**
 * Bookable Services, availability and the transactional public booking command
 * (S4-002).
 *
 * Authenticated management (Service CRUD, availability rules, booking list /
 * cancel) is tenant-scoped by `ctx.organizationId` (proven by
 * `OrganizationGuard`, never a client value) and gated by the central policy:
 * `service:read`/`service:write`, `booking:read`/`booking:write`. Cross-tenant
 * or missing ids surface as 404 (never 403), mirroring the other modules, so a
 * caller can't probe another org's resources.
 *
 * The PUBLIC {@link book} command is UNAUTHENTICATED and org-agnostic: the
 * owning org is derived from the target Service, so an anonymous booker can only
 * ever create rows in the org that owns the Service. Its central guarantee —
 * "only one confirmed booking can own a capacity-one slot" — is enforced by a
 * SERIALIZABLE transaction that re-counts CONFIRMED overlaps INSIDE the tx (see
 * {@link book} for the full race argument).
 */
@Injectable()
export class BookingsService {
    /**
     * @param rateLimiter per-instance limiter (default 5 hits / minute per
     * `${serviceId}:${ipHash}`). Injectable for tests.
     */
    constructor(
        private readonly rateLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(),
    ) {}

    // ── Service CRUD ───────────────────────────────────────────────────────

    /**
     * Create a bookable Service for the org. Authorizes `service:write`,
     * validates the IANA timezone and (if given) that `siteId` belongs to the
     * org. New services are ACTIVE and immediately bookable.
     */
    async createService(
        ctx: OrganizationContext,
        dto: CreateServiceDto,
    ): Promise<Service> {
        authorize(ctx, "service:write");

        this.assertValidTimezone(dto.timezone);
        if (dto.siteId) {
            await this.requireOwnedSite(ctx, dto.siteId);
        }

        return prisma.service.create({
            data: {
                organizationId: ctx.organizationId,
                siteId: dto.siteId ?? null,
                name: dto.name,
                description: dto.description ?? null,
                durationMinutes: dto.durationMinutes,
                bufferBeforeMinutes: dto.bufferBeforeMinutes ?? 0,
                bufferAfterMinutes: dto.bufferAfterMinutes ?? 0,
                capacity: dto.capacity ?? 1,
                priceCents: dto.priceCents ?? null,
                currency: dto.currency ?? null,
                timezone: dto.timezone,
                status: "ACTIVE",
            },
        });
    }

    /** List the org's services, newest first (excludes soft-deleted). `service:read`. */
    async listServices(ctx: OrganizationContext): Promise<Service[]> {
        authorize(ctx, "service:read");
        return prisma.service.findMany({
            where: { organizationId: ctx.organizationId, deletedAt: null },
            orderBy: { createdAt: "desc" },
        });
    }

    /** Get one owned service. `service:read`; cross-tenant/missing → 404. */
    async getService(
        ctx: OrganizationContext,
        serviceId: string,
    ): Promise<Service> {
        authorize(ctx, "service:read");
        return this.requireOwnedService(ctx, serviceId);
    }

    /**
     * Update a Service. Authorizes `service:write`, loads the org's own service
     * (404 otherwise), re-validates a new timezone. Only supplied fields change.
     */
    async updateService(
        ctx: OrganizationContext,
        serviceId: string,
        dto: UpdateServiceDto,
    ): Promise<Service> {
        authorize(ctx, "service:write");

        const service = await this.requireOwnedService(ctx, serviceId);

        if (dto.timezone !== undefined) {
            this.assertValidTimezone(dto.timezone);
        }

        const data: Prisma.ServiceUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.durationMinutes !== undefined) {
            data.durationMinutes = dto.durationMinutes;
        }
        if (dto.bufferBeforeMinutes !== undefined) {
            data.bufferBeforeMinutes = dto.bufferBeforeMinutes;
        }
        if (dto.bufferAfterMinutes !== undefined) {
            data.bufferAfterMinutes = dto.bufferAfterMinutes;
        }
        if (dto.capacity !== undefined) data.capacity = dto.capacity;
        if (dto.priceCents !== undefined) data.priceCents = dto.priceCents;
        if (dto.currency !== undefined) data.currency = dto.currency;
        if (dto.timezone !== undefined) data.timezone = dto.timezone;
        if (dto.status !== undefined) data.status = dto.status;

        return prisma.service.update({ where: { id: service.id }, data });
    }

    /**
     * Soft-delete a Service: set `deletedAt` + ARCHIVED so it stops accepting
     * bookings while its historical bookings survive. `service:write`;
     * cross-tenant/missing → 404.
     */
    async removeService(
        ctx: OrganizationContext,
        serviceId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "service:write");

        const service = await this.requireOwnedService(ctx, serviceId);
        await prisma.service.update({
            where: { id: service.id },
            data: { deletedAt: new Date(), status: "ARCHIVED" },
        });
        return { id: service.id, deleted: true };
    }

    // ── Availability rules ─────────────────────────────────────────────────

    /** List a service's availability rules. `service:read`. */
    async listRules(ctx: OrganizationContext, serviceId: string) {
        authorize(ctx, "service:read");
        await this.requireOwnedService(ctx, serviceId);
        return prisma.availabilityRule.findMany({
            where: { serviceId, organizationId: ctx.organizationId },
            orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        });
    }

    /**
     * Replace a service's ENTIRE rule set atomically (delete-all + create-all in
     * one tx). Authorizes `service:write`; validates every rule. Empty array
     * clears availability.
     */
    async replaceRules(
        ctx: OrganizationContext,
        serviceId: string,
        rules: AvailabilityRuleDto[],
    ) {
        authorize(ctx, "service:write");
        await this.requireOwnedService(ctx, serviceId);
        rules.forEach((rule) => this.assertRuleWellFormed(rule));

        return prisma.$transaction(async (tx) => {
            await tx.availabilityRule.deleteMany({ where: { serviceId } });
            if (rules.length > 0) {
                await tx.availabilityRule.createMany({
                    data: rules.map((rule) => ({
                        organizationId: ctx.organizationId,
                        serviceId,
                        dayOfWeek: rule.dayOfWeek,
                        startMinute: rule.startMinute,
                        endMinute: rule.endMinute,
                    })),
                });
            }
            return tx.availabilityRule.findMany({
                where: { serviceId },
                orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
            });
        });
    }

    /** Add a single availability rule to a service. `service:write`. */
    async addRule(
        ctx: OrganizationContext,
        serviceId: string,
        rule: AvailabilityRuleDto,
    ) {
        authorize(ctx, "service:write");
        await this.requireOwnedService(ctx, serviceId);
        this.assertRuleWellFormed(rule);

        return prisma.availabilityRule.create({
            data: {
                organizationId: ctx.organizationId,
                serviceId,
                dayOfWeek: rule.dayOfWeek,
                startMinute: rule.startMinute,
                endMinute: rule.endMinute,
            },
        });
    }

    /** Delete one availability rule (must belong to an owned service). `service:write`. */
    async deleteRule(
        ctx: OrganizationContext,
        serviceId: string,
        ruleId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "service:write");
        await this.requireOwnedService(ctx, serviceId);

        const rule = await prisma.availabilityRule.findUnique({
            where: { id: ruleId },
        });
        if (
            rule?.serviceId !== serviceId ||
            rule.organizationId !== ctx.organizationId
        ) {
            throw new NotFoundException("Availability rule not found");
        }
        await prisma.availabilityRule.delete({ where: { id: rule.id } });
        return { id: rule.id, deleted: true };
    }

    // ── Availability (open slots) ──────────────────────────────────────────

    /**
     * Authenticated availability preview for an owned service over `[from, to)`.
     * `service:read`. Returns absolute-UTC open slots (capacity honoured).
     */
    async availability(
        ctx: OrganizationContext,
        serviceId: string,
        fromISO: string,
        toISO: string,
    ): Promise<Slot[]> {
        authorize(ctx, "service:read");
        const service = await this.requireOwnedService(ctx, serviceId);
        const { from, to } = this.parseRange(fromISO, toISO);
        const rules = await prisma.availabilityRule.findMany({
            where: { serviceId },
        });
        const confirmed = await this.confirmedOverlapping(serviceId, from, to);
        return availableSlots(
            this.toAvailabilityService(service),
            rules,
            from,
            to,
            confirmed,
        );
    }

    /**
     * PUBLIC availability for a bookable service — no auth, org-agnostic. Loads
     * the ACTIVE service (404/410 otherwise) and returns open slots for the
     * range. The org is never surfaced.
     */
    async publicAvailability(
        serviceId: string,
        fromISO: string,
        toISO: string,
    ): Promise<Slot[]> {
        const { service, rules } = await this.loadBookableService(serviceId);
        const { from, to } = this.parseRange(fromISO, toISO);
        const confirmed = await this.confirmedOverlapping(serviceId, from, to);
        return availableSlots(
            this.toAvailabilityService(service),
            rules,
            from,
            to,
            confirmed,
        );
    }

    // ── Bookings (management) ──────────────────────────────────────────────

    /** List the org's bookings (optionally for one service), newest slot first. `booking:read`. */
    async listBookings(
        ctx: OrganizationContext,
        serviceId?: string,
    ): Promise<Booking[]> {
        authorize(ctx, "booking:read");
        if (serviceId) {
            // Ensure the service is owned before filtering by it (404 otherwise).
            await this.requireOwnedService(ctx, serviceId);
        }
        return prisma.booking.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(serviceId ? { serviceId } : {}),
            },
            orderBy: { startAt: "desc" },
        });
    }

    /**
     * Cancel a booking: set status CANCELLED + `cancelledAt`, freeing the slot.
     * Authorizes `booking:write`; cross-tenant/missing → 404. Idempotent — an
     * already-cancelled booking is returned unchanged.
     */
    async cancelBooking(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<Booking> {
        authorize(ctx, "booking:write");

        const booking = await this.requireOwnedBooking(ctx, bookingId);
        if (booking.status === "CANCELLED") {
            return booking;
        }
        return prisma.booking.update({
            where: { id: booking.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });
    }

    // ── PUBLIC booking command ─────────────────────────────────────────────

    /**
     * Reserve a slot on a public Service. Steps (in order):
     *  1. Load the Service (+ rules); 404 if missing/soft-deleted, 410 if not ACTIVE.
     *     The org is taken from `service.organizationId`, NEVER from the client.
     *  2. Validate `startAt` is a real, geometrically-valid open slot (aligned to
     *     a rule window + duration stepping) — 400 otherwise.
     *  3. Idempotency: an existing booking for `(serviceId, idempotencyKey)` is replayed.
     *  4. Rate-limit by `${serviceId}:${ipHash}`; 429 on exceed.
     *  5. In ONE Serializable transaction: RE-COUNT confirmed overlaps and abort
     *     (409) if `>= capacity`, else upsert the Contact, create the CONFIRMED
     *     Booking (immutable snapshot), and enqueue the `booking.notify` Job.
     *
     * WHY the serializable in-tx re-count guarantees "only one confirmed booking
     * can own a capacity-one slot":
     *  - The step-4 pre-check is best-effort — two requests can both read
     *    count = 0 before either writes, so it CANNOT be the guarantee.
     *  - Inside a `Serializable` transaction, the `booking.count(...)` predicate
     *    read is tracked by Postgres' SSI. If two concurrent transactions both
     *    read "0 confirmed overlaps" and both INSERT a CONFIRMED booking into the
     *    same slot, their read/write sets form a dangerous dependency cycle;
     *    Postgres detects it at commit and aborts one with a serialization
     *    failure (surfaced by Prisma as P2034). So at most ONE commits — the
     *    other is rolled back and mapped to 409. The re-count also directly
     *    returns 409 when a conflicting booking is already committed and visible.
     *    Buffers are part of the slot geometry, so overlap uses the [start,end]
     *    interval — a capacity-1 slot admits exactly one CONFIRMED booking.
     */
    async book(
        serviceId: string,
        input: BookInput,
        ipHash: string | undefined,
    ): Promise<Booking> {
        // 1. Load the Service. Org is derived from HERE, never the client.
        const { service, rules } = await this.loadBookableService(serviceId);

        // 2. Validate the requested instant is a real, aligned slot start.
        const startAt = new Date(input.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        const availService = this.toAvailabilityService(service);
        if (!isValidSlotStart(availService, rules, startAt)) {
            throw new BadRequestException(
                "startAt is not a bookable slot for this service",
            );
        }
        const endAt = new Date(
            startAt.getTime() + service.durationMinutes * 60_000,
        );

        // 3. Idempotency pre-check — replay an existing booking unchanged.
        if (input.idempotencyKey) {
            const existing = await prisma.booking.findUnique({
                where: {
                    serviceId_idempotencyKey: {
                        serviceId,
                        idempotencyKey: input.idempotencyKey,
                    },
                },
            });
            if (existing) return existing;
        }

        // 4. Rate-limit per (service, hashed IP). Cheap abuse guard.
        if (ipHash) {
            const allowed = this.rateLimiter.take(`${serviceId}:${ipHash}`);
            if (!allowed) {
                throw new HttpException(
                    "Too many booking attempts — please slow down and try again shortly",
                    429,
                );
            }
        }

        const organizationId = service.organizationId;
        const email = input.bookerEmail.trim().toLowerCase();
        const snapshot = this.buildSnapshot(service, input, startAt, endAt);

        // 5. Atomic, serializable reservation (see the method doc for WHY).
        try {
            return await prisma.$transaction(
                async (tx) => {
                    // Authoritative capacity gate — re-counted INSIDE the tx.
                    const confirmed = await tx.booking.count({
                        where: {
                            serviceId,
                            status: "CONFIRMED",
                            startAt: { lt: endAt },
                            endAt: { gt: startAt },
                        },
                    });
                    if (confirmed >= service.capacity) {
                        throw new ConflictException(
                            "This slot is fully booked",
                        );
                    }

                    const contact = await tx.contact.upsert({
                        where: {
                            organizationId_email: { organizationId, email },
                        },
                        update: this.contactUpdate(input),
                        create: {
                            organizationId,
                            email,
                            firstName:
                                this.splitName(input.bookerName).first ?? null,
                            lastName:
                                this.splitName(input.bookerName).last ?? null,
                            phone: input.bookerPhone ?? null,
                            source: `booking:service:${serviceId}`,
                        },
                    });

                    const booking = await tx.booking.create({
                        data: {
                            organizationId,
                            serviceId,
                            contactId: contact.id,
                            startAt,
                            endAt,
                            timezone: service.timezone,
                            status: "CONFIRMED",
                            snapshot: snapshot as Prisma.InputJsonValue,
                            bookerName: input.bookerName ?? null,
                            bookerEmail: email,
                            bookerPhone: input.bookerPhone ?? null,
                            idempotencyKey: input.idempotencyKey ?? null,
                        },
                    });

                    // Transactional outbox: a committed booking ALWAYS has a
                    // pending notification (the worker/handler is a later ticket).
                    await tx.job.create({
                        data: {
                            organizationId,
                            type: "booking.notify",
                            payload: {
                                bookingId: booking.id,
                                serviceId,
                                contactId: contact.id,
                            },
                        },
                    });

                    return booking;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            );
        } catch (err) {
            const code = (err as { code?: string }).code;
            // Idempotency race: two concurrent books with the same
            // (serviceId, idempotencyKey) — the unique index rejects the second
            // (P2002). Re-read and replay the winner instead of erroring.
            if (input.idempotencyKey && code === "P2002") {
                const existing = await prisma.booking.findUnique({
                    where: {
                        serviceId_idempotencyKey: {
                            serviceId,
                            idempotencyKey: input.idempotencyKey,
                        },
                    },
                });
                if (existing) return existing;
            }
            // Serialization failure (two books racing for the same capacity-one
            // slot, both saw 0 and inserted) — Postgres aborted the loser. Map
            // it to the same 409 as a lost race: the slot is taken.
            if (code === "P2034") {
                throw new ConflictException("This slot is fully booked");
            }
            throw err;
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /** Load an ACTIVE, non-deleted bookable service + its rules, or throw (404/410). */
    private async loadBookableService(
        serviceId: string,
    ): Promise<{ service: Service; rules: AvailabilityRuleWindow[] }> {
        const service = await prisma.service.findUnique({
            where: { id: serviceId },
            include: { availabilityRules: true },
        });
        if (service?.deletedAt !== null) {
            throw new NotFoundException("Service not found");
        }
        if (service.status !== "ACTIVE") {
            throw new GoneException("This service is not accepting bookings");
        }
        const { availabilityRules, ...rest } = service;
        return { service: rest, rules: availabilityRules };
    }

    /** Confirmed bookings overlapping `[from, to)` for a service (for capacity checks). */
    private async confirmedOverlapping(
        serviceId: string,
        from: Date,
        to: Date,
    ): Promise<Interval[]> {
        return prisma.booking.findMany({
            where: {
                serviceId,
                status: "CONFIRMED",
                startAt: { lt: to },
                endAt: { gt: from },
            },
            select: { startAt: true, endAt: true },
        });
    }

    /** Narrow a Prisma Service to the structural subset the pure module needs. */
    private toAvailabilityService(service: Service): AvailabilityService {
        return {
            durationMinutes: service.durationMinutes,
            bufferBeforeMinutes: service.bufferBeforeMinutes,
            bufferAfterMinutes: service.bufferAfterMinutes,
            capacity: service.capacity,
            timezone: service.timezone,
        };
    }

    /** The immutable snapshot of Service terms + booker frozen onto a Booking. */
    private buildSnapshot(
        service: Service,
        input: BookInput,
        startAt: Date,
        endAt: Date,
    ): Record<string, unknown> {
        return {
            service: {
                id: service.id,
                name: service.name,
                durationMinutes: service.durationMinutes,
                bufferBeforeMinutes: service.bufferBeforeMinutes,
                bufferAfterMinutes: service.bufferAfterMinutes,
                capacity: service.capacity,
                timezone: service.timezone,
                priceCents: service.priceCents,
                currency: service.currency,
            },
            slot: {
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString(),
            },
            booker: {
                name: input.bookerName ?? null,
                email: input.bookerEmail.trim().toLowerCase(),
                phone: input.bookerPhone ?? null,
            },
        };
    }

    /** Contact fields to update on a repeat booking (only supplied values). */
    private contactUpdate(input: BookInput): Prisma.ContactUpdateInput {
        const update: Prisma.ContactUpdateInput = {};
        const { first, last } = this.splitName(input.bookerName);
        if (first !== undefined) update.firstName = first;
        if (last !== undefined) update.lastName = last;
        if (input.bookerPhone !== undefined) update.phone = input.bookerPhone;
        return update;
    }

    /** Split a single "full name" into first / last parts. */
    private splitName(full: string | undefined): {
        first?: string;
        last?: string;
    } {
        if (!full) return {};
        const parts = full.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return {};
        if (parts.length === 1) return { first: parts[0] };
        return { first: parts[0], last: parts.slice(1).join(" ") };
    }

    private parseRange(
        fromISO: string,
        toISO: string,
    ): { from: Date; to: Date } {
        const from = new Date(fromISO);
        const to = new Date(toISO);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new BadRequestException("from/to must be valid ISO instants");
        }
        if (from.getTime() >= to.getTime()) {
            throw new BadRequestException("from must be before to");
        }
        return { from, to };
    }

    private assertValidTimezone(timezone: string): void {
        if (!IANAZone.isValidZone(timezone)) {
            throw new BadRequestException(
                `"${timezone}" is not a valid IANA timezone`,
            );
        }
    }

    private assertRuleWellFormed(rule: AvailabilityRuleDto): void {
        if (rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
            throw new BadRequestException("dayOfWeek must be 0–6");
        }
        if (
            rule.startMinute < 0 ||
            rule.endMinute > 1440 ||
            rule.startMinute >= rule.endMinute
        ) {
            throw new BadRequestException(
                "require 0 <= startMinute < endMinute <= 1440",
            );
        }
    }

    private async requireOwnedService(
        ctx: OrganizationContext,
        serviceId: string,
    ): Promise<Service> {
        const service = await prisma.service.findUnique({
            where: { id: serviceId },
        });
        if (
            service?.organizationId !== ctx.organizationId ||
            service.deletedAt !== null
        ) {
            throw new NotFoundException("Service not found");
        }
        return service;
    }

    private async requireOwnedBooking(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<Booking> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
        });
        if (booking?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Booking not found");
        }
        return booking;
    }

    private async requireOwnedSite(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<void> {
        const site = await prisma.site.findUnique({ where: { id: siteId } });
        if (site?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Site not found");
        }
    }
}
