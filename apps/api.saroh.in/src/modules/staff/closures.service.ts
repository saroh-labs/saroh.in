import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { requireBookingPower } from "../bookings/booking-access";
import { businessTimezone } from "../bookings/staff-availability";
import type { AddClosureDto, OffRangeDto, PreviewOffDto } from "./dto";
import type { BookingBrief } from "./off-bookings";
import { bookingsInSpans } from "./off-bookings";
import type { OffSpan } from "./off-range";
import { offRangeRefusal, offSpans } from "./off-range";

const DAY = 86_400_000;
/** How far back the read carries closures, as it does time off. */
const HISTORY_DAYS = 31;

/** One row of the business being closed. The reason is team-only. */
export interface ClosureView {
    id: string;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    reason: string | null;
}

/** Closures that end after `since`, soonest first. */
export async function closureViews(
    organizationId: string,
    since: Date,
): Promise<ClosureView[]> {
    return prisma.businessClosure.findMany({
        where: { organizationId, endAt: { gte: since } },
        select: {
            id: true,
            startAt: true,
            endAt: true,
            allDay: true,
            reason: true,
        },
        orderBy: { startAt: "asc" },
    });
}

function refuse(message: string, field: string): never {
    throw new BadRequestException({ message, field });
}

/**
 * "Everyone — business closed" (E3): days, or the same hours on each of a
 * range of days, when nobody can be booked on any service. Availability, the
 * booking page and the calendar take closures out before anyone's hours or
 * a service's rules.
 *
 * Bookings already made in that time are kept and listed — a closure never
 * cancels anything. Reads need `service:read`; writes `service:write`, like
 * time off (ADR-008).
 */
@Injectable()
export class ClosuresService {
    async list(
        ctx: OrganizationContext,
        now = new Date(),
    ): Promise<ClosureView[]> {
        requireBookingPower(ctx, "service:read");
        return closureViews(
            ctx.organizationId,
            new Date(now.getTime() - HISTORY_DAYS * DAY),
        );
    }

    async add(
        ctx: OrganizationContext,
        dto: AddClosureDto,
        now = new Date(),
    ): Promise<{ closures: ClosureView[]; affected: BookingBrief[] }> {
        requireBookingPower(ctx, "service:write");
        const spans = await this.spansOf(ctx, dto);
        const reason = dto.reason?.trim() ? dto.reason.trim() : null;
        await prisma.businessClosure.createMany({
            data: spans.map((span) => ({
                organizationId: ctx.organizationId,
                startAt: span.startAt,
                endAt: span.endAt,
                allDay: span.allDay,
                reason,
                createdByUserId: ctx.userId,
            })),
        });
        const affected = await bookingsInSpans(
            ctx.organizationId,
            null,
            spans,
            now,
        );
        return { closures: await this.list(ctx, now), affected };
    }

    /** Take away one line — every row of it — or nothing. */
    async remove(
        ctx: OrganizationContext,
        ids: string[],
        now = new Date(),
    ): Promise<ClosureView[]> {
        requireBookingPower(ctx, "service:write");
        const unique = [...new Set(ids)];
        await prisma.$transaction(async (tx) => {
            const { count } = await tx.businessClosure.deleteMany({
                where: {
                    id: { in: unique },
                    organizationId: ctx.organizationId,
                },
            });
            if (count !== unique.length) {
                throw new NotFoundException("Closure not found");
            }
        });
        return this.list(ctx, now);
    }

    /**
     * The confirmed bookings a range would cover, before it is saved: one
     * person's for their time off, or everyone's for a closure. The
     * Availability screen says "3 bookings fall in this time" from it.
     */
    async preview(
        ctx: OrganizationContext,
        dto: PreviewOffDto,
        now = new Date(),
    ): Promise<{ affected: BookingBrief[] }> {
        requireBookingPower(ctx, "service:write");
        if (dto.staffId) {
            const person = await prisma.staffMember.findFirst({
                where: { id: dto.staffId, organizationId: ctx.organizationId },
                select: { id: true },
            });
            if (!person) throw new NotFoundException("Staff member not found");
        }
        const spans = await this.spansOf(ctx, dto);
        return {
            affected: await bookingsInSpans(
                ctx.organizationId,
                dto.staffId ?? null,
                spans,
                now,
            ),
        };
    }

    private async spansOf(
        ctx: OrganizationContext,
        range: OffRangeDto,
    ): Promise<OffSpan[]> {
        const refusal = offRangeRefusal(range);
        if (refusal) refuse(refusal.message, refusal.field);
        const zone = await businessTimezone(prisma, ctx.organizationId);
        const spans = offSpans(range, zone);
        if (spans.length === 0) {
            refuse("Those hours don't happen on those days.", "startMinute");
        }
        return spans;
    }
}
