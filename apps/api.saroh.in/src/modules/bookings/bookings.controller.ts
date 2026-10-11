import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import type { Booking } from "@saroh/database";

import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { payLinkUrlFor } from "../invoices/pay-link-url";
import type { DeskPayment } from "./booking-desk-pay";
import type { WithoutIntakeNote } from "./booking-intake";
import { withoutIntakeNote } from "./booking-intake";
import type {
    BookingDetailView,
    BookingsCalendar,
    CancelledBooking,
} from "./bookings.service";
import { BookingsService } from "./bookings.service";
import { TakeDeskPaymentDto } from "./desk-pay.dto";
import {
    AddRuleDto,
    BookByHandDto,
    BookingsRangeQueryDto,
    BookVisitDto,
    CreateServiceDto,
    RecordOutcomeDto,
    ReplaceRulesDto,
    RescheduleBookingDto,
    UpdateServiceDto,
} from "./dto";
import type { ServiceView } from "./service-fields";

/**
 * Authorized bookable-Service + availability + booking management for an
 * Organization (S4-002), scoped to `/organizations/:organizationId/services`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()`; the service enforces `service:*`/`booking:*` on top. The
 * PUBLIC booking endpoint is deliberately NOT here — it lives in the guardless
 * {@link PublicBookingsController}.
 *
 * Appointments is required per handler, not on the class (#117): services,
 * rules, availability and every booking write carry
 * `@RequireModule("APPOINTMENTS")`. The three reads of bookings already made
 * — the calendar range, a service's bookings and one booking — are history,
 * and stay readable when a business switches Appointments off
 * (`MODULE_ROLLOUT.md`); the service still asks `booking:read`. Cancelling a
 * booking already made is winding down, and stays open too.
 */
@Controller("organizations/:organizationId/services")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
export class BookingsController {
    constructor(private readonly bookings: BookingsService) {}

    // ── Services ────────────────────────────────────────────────────────────

    @Post()
    @RequireModule("APPOINTMENTS")
    @HttpCode(201)
    createService(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateServiceDto,
    ): Promise<ServiceView> {
        return this.bookings.createService(ctx, dto);
    }

    @Get()
    @RequireModule("APPOINTMENTS")
    listServices(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<ServiceView[]> {
        return this.bookings.listServices(ctx);
    }

    /**
     * The bookings calendar in one read (U4): every booking in `[from, to)`
     * by person, class sessions with who is booked and how they paid.
     * Declared BEFORE `:serviceId`, which would otherwise take "bookings" as
     * a service id.
     */
    @Get("bookings")
    calendarBookings(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: BookingsRangeQueryDto,
    ): Promise<BookingsCalendar> {
        return this.bookings.calendarBookings(ctx, query);
    }

    @Get(":serviceId")
    @RequireModule("APPOINTMENTS")
    getService(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ): Promise<ServiceView> {
        return this.bookings.getService(ctx, serviceId);
    }

    @Patch(":serviceId")
    @RequireModule("APPOINTMENTS")
    updateService(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Body() dto: UpdateServiceDto,
    ): Promise<ServiceView> {
        return this.bookings.updateService(ctx, serviceId, dto);
    }

    @Delete(":serviceId")
    @RequireModule("APPOINTMENTS")
    removeService(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ): Promise<{ id: string; deleted: true }> {
        return this.bookings.removeService(ctx, serviceId);
    }

    // ── Availability rules ──────────────────────────────────────────────────

    @Get(":serviceId/rules")
    @RequireModule("APPOINTMENTS")
    listRules(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ) {
        return this.bookings.listRules(ctx, serviceId);
    }

    @Put(":serviceId/rules")
    @RequireModule("APPOINTMENTS")
    replaceRules(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Body() dto: ReplaceRulesDto,
    ) {
        return this.bookings.replaceRules(ctx, serviceId, dto.rules);
    }

    @Post(":serviceId/rules")
    @RequireModule("APPOINTMENTS")
    @HttpCode(201)
    addRule(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Body() dto: AddRuleDto,
    ) {
        return this.bookings.addRule(ctx, serviceId, dto);
    }

    @Delete(":serviceId/rules/:ruleId")
    @RequireModule("APPOINTMENTS")
    deleteRule(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Param("ruleId") ruleId: string,
    ): Promise<{ id: string; deleted: true }> {
        return this.bookings.deleteRule(ctx, serviceId, ruleId);
    }

    // ── Availability preview ────────────────────────────────────────────────

    @Get(":serviceId/availability")
    @RequireModule("APPOINTMENTS")
    availability(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Query("from") from: string,
        @Query("to") to: string,
        @Query("staffId") staffId?: string,
    ) {
        return this.bookings.availability(ctx, serviceId, from, to, staffId);
    }

    // ── Bookings ────────────────────────────────────────────────────────────

    @Get(":serviceId/bookings")
    listServiceBookings(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
    ): Promise<WithoutIntakeNote<Booking>[]> {
        return this.bookings.listBookings(ctx, serviceId);
    }

    /** A booking made by the merchant for someone (#384). */
    @Post(":serviceId/bookings")
    @RequireModule("APPOINTMENTS")
    @HttpCode(201)
    bookByHand(
        @OrgContext() ctx: OrganizationContext,
        @Param("serviceId") serviceId: string,
        @Body() dto: BookByHandDto,
    ): Promise<WithoutIntakeNote<Booking>> {
        // A booking's note is sensitive (E7): an answer that changes a
        // booking never carries it; only the detail read does, gated.
        return this.bookings
            .bookByHand(ctx, serviceId, dto)
            .then(withoutIntakeNote);
    }

    /**
     * One booking, with its service, its contact and its history (#121).
     * Declared before the `:serviceId` routes cannot matter — the literal
     * "bookings" segment is a different shape — but it is grouped here with
     * the other booking routes rather than the service ones.
     */
    @Get("bookings/:bookingId")
    getBooking(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
    ): Promise<BookingDetailView> {
        return this.bookings.getBooking(ctx, bookingId);
    }

    /**
     * Move a booking to another slot (#121). PATCH, not PUT: this changes one
     * thing about a booking and leaves its terms alone.
     */
    @Patch("bookings/:bookingId")
    @RequireModule("APPOINTMENTS")
    rescheduleBooking(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
        @Body() dto: RescheduleBookingDto,
    ): Promise<WithoutIntakeNote<Booking>> {
        return this.bookings
            .rescheduleBooking(ctx, bookingId, dto)
            .then(withoutIntakeNote);
    }

    /**
     * Record how an appointment went (#241). A separate route from the
     * reschedule PATCH because it is a separate decision: one changes when the
     * appointment is, the other says what happened at it.
     */
    @Post("bookings/:bookingId/outcome")
    @LifecycleWrite("wind-down")
    @RequireModule("APPOINTMENTS")
    @HttpCode(200)
    recordOutcome(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
        @Body() dto: RecordOutcomeDto,
    ): Promise<WithoutIntakeNote<Booking>> {
        return this.bookings
            .recordOutcome(ctx, bookingId, dto.outcome)
            .then(withoutIntakeNote);
    }

    /**
     * "Send a pay link" (E4): issue the booking's invoice and answer with
     * its pay link — once: only its hash is kept, so asking again makes a
     * new link and retires the old one. Saroh sends nothing itself yet.
     */
    @Post("bookings/:bookingId/pay-link")
    @LifecycleWrite("wind-down")
    @RequireModule("APPOINTMENTS")
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    async payLink(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
    ): Promise<{ url: string }> {
        const { token } = await this.bookings.payLink(ctx, bookingId);
        return { url: await payLinkUrlFor(ctx.organizationId, token) };
    }

    /**
     * "Take ₹X" at the desk (round-2 P2): cash, UPI at the counter or card,
     * recorded on the booking's invoice (made, found, or a deposit's
     * balance). 409 when there is nothing to take, a payment is going
     * through online, or the amount changed; the same take asked again
     * answers as it did.
     */
    @Post("bookings/:bookingId/desk-payment")
    @LifecycleWrite("wind-down")
    @RequireModule("APPOINTMENTS")
    @HttpCode(200)
    takeDeskPayment(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
        @Body() dto: TakeDeskPaymentDto,
    ): Promise<DeskPayment> {
        return this.bookings.takeDeskPayment(ctx, bookingId, dto);
    }

    /**
     * Book visit `n` of a treatment (E9, DEC-050): a treatment is one order
     * with a booking per visit. 409 past its visits, before the previous
     * visit is booked, or when this one already is; never invoiced.
     */
    @Post("treatments/:orderId/visits")
    @RequireModule("APPOINTMENTS")
    @HttpCode(201)
    bookVisit(
        @OrgContext() ctx: OrganizationContext,
        @Param("orderId") orderId: string,
        @Body() dto: BookVisitDto,
    ): Promise<WithoutIntakeNote<Booking>> {
        return this.bookings
            .bookVisit(ctx, orderId, dto)
            .then(withoutIntakeNote);
    }

    /**
     * `?returnCredit=true` when the business calls it off (a whole class):
     * the class paid for goes back even inside the free-cancellation window.
     * `?closesClass=true` when the whole class is cancelled: its waitlist is
     * closed rather than offered the place (A12).
     *
     * Not gated on Appointments (#117, owner 9 Oct): a business that
     * switched Appointments off can still cancel a booking already made,
     * and the refund its policy gives (DEC-058). `booking:*` still applies.
     */
    @Delete("bookings/:bookingId")
    @LifecycleWrite("wind-down")
    cancelBooking(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
        @Query("returnCredit") returnCredit?: string,
        @Query("closesClass") closesClass?: string,
    ): Promise<WithoutIntakeNote<CancelledBooking>> {
        return this.bookings
            .cancelBooking(ctx, bookingId, undefined, {
                returnCredit: returnCredit === "true",
                closesClass: closesClass === "true",
            })
            .then(withoutIntakeNote);
    }
}
