import { Body, Controller, Param, Query, Req, UseGuards } from "@nestjs/common";
import type {
    BookingView,
    CancelledBookingView,
    CreateBookingBody,
    ListBookingsQuery,
    MoveBookingBody,
} from "@saroh/api-contract";
import {
    createBookingBody,
    id,
    listBookingsQuery,
    moveBookingBody,
    v1CancelBooking,
    v1CreateBooking,
    v1GetBooking,
    v1ListBookings,
    v1MoveBooking,
} from "@saroh/api-contract";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { KeyedRequest } from "../api-keys/api-key.guard";
import { ApiKeyGuard } from "../api-keys/api-key.guard";
import { BookingsService } from "../bookings/bookings.service";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { authorize } from "../organizations/organization-policy";
import { bookingById, bookingsPage, bookingView } from "./v1-reads";
import { ContractRoute, notFound, once } from "./v1-support";

const anId = new ZodContractPipe(id);

/**
 * Bookings on `/v1` (plan 2026-11-10-001, U8). Made, moved and cancelled
 * through the workspace's `BookingsService`, so a key's booking keeps the
 * app's rules: the diary, the hours, and on cancel the business's own
 * policy, refund included, through its own provider.
 */
@Controller("v1")
@UseGuards(ApiKeyGuard, ModuleEnforcementGuard)
export class BookingsV1Controller {
    constructor(
        private readonly bookings: BookingsService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @ContractRoute(v1ListBookings)
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query(new ZodContractPipe(listBookingsQuery)) query: ListBookingsQuery,
    ) {
        authorize(ctx, "booking:read");
        return bookingsPage(ctx.organizationId, query);
    }

    @ContractRoute(v1GetBooking)
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId", anId) bookingId: string,
    ): Promise<BookingView> {
        authorize(ctx, "booking:read");
        return this.booking(ctx, bookingId);
    }

    @ContractRoute(v1CreateBooking)
    @RequireModule("APPOINTMENTS")
    create(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Body(new ZodContractPipe(createBookingBody)) body: CreateBookingBody,
    ): Promise<BookingView> {
        authorize(ctx, "booking:write");
        return once(this.idempotency, req, ctx, body, async () => {
            const { serviceId, ...dto } = body;
            // The service's own lookup is the business's: another's is a 404.
            const made = await this.bookings.bookByHand(ctx, serviceId, dto);
            return this.booking(ctx, made.id);
        });
    }

    @ContractRoute(v1MoveBooking)
    @RequireModule("APPOINTMENTS")
    move(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("bookingId", anId) bookingId: string,
        @Body(new ZodContractPipe(moveBookingBody)) body: MoveBookingBody,
    ): Promise<BookingView> {
        authorize(ctx, "booking:write");
        return once(
            this.idempotency,
            req,
            ctx,
            { bookingId, body },
            async () => {
                await this.bookings.rescheduleBooking(ctx, bookingId, body);
                return this.booking(ctx, bookingId);
            },
        );
    }

    /**
     * Wind-down, as in the app: a business that is closing can still cancel
     * a booking already made. A second cancel changes nothing and refunds
     * nothing (the service re-reads the booking under its locks).
     */
    @ContractRoute(v1CancelBooking)
    @LifecycleWrite("wind-down")
    cancel(
        @OrgContext() ctx: OrganizationContext,
        @Req() req: KeyedRequest,
        @Param("bookingId", anId) bookingId: string,
    ): Promise<CancelledBookingView> {
        authorize(ctx, "booking:write");
        return once(this.idempotency, req, ctx, { bookingId }, async () => {
            const { money, ...booking } = await this.bookings.cancelBooking(
                ctx,
                bookingId,
            );
            return {
                ...bookingView(booking),
                money: {
                    refund: money.refund && {
                        amount: {
                            amountMinor: money.refund.amountCents,
                            currency: money.refund.currency,
                        },
                        status: money.refund.status,
                    },
                    kept: money.kept && {
                        amountMinor: money.kept.amountCents,
                        currency: money.kept.currency,
                    },
                },
            };
        });
    }

    private async booking(ctx: OrganizationContext, bookingId: string) {
        const found = await bookingById(ctx.organizationId, bookingId);
        if (!found) throw notFound("booking");
        return found;
    }
}
