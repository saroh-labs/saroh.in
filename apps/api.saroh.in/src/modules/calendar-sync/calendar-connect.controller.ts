import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";

import { auth } from "../../common/auth/auth";
import { LifecycleWrite } from "../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { assertEditionMatchesAddress } from "../../common/edition-address";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { assertWorkspaceWrite } from "../organizations/organization-lifecycle.gate";
import { apiBase } from "../payments/webhook-setup";
import { CalendarBookingsService } from "./calendar-bookings.service";
import {
    CALLBACK_PATH,
    CalendarConnectService,
} from "./calendar-connect.service";
import type {
    BookingMeetingView,
    CalendarMemberView,
    CalendarStatusView,
    ConnectStartView,
    DisconnectView,
    GoogleCalendarOptionView,
    MoveBookingsView,
} from "./dto";
import { BookingMeetingDto, ChooseCalendarsDto, MeetAccessDto } from "./dto";

/**
 * A person's own Google Calendar in this business (#1047, U4; several
 * accounts, DEC-233), the team's read of it, and a booking's Meet. The
 * flag, the plan and the permission are checked in the services. Never
 * cached: each answer is the person's own.
 */
@Controller("organizations/:organizationId/calendar/google")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class CalendarConnectController {
    constructor(
        private readonly calendars: CalendarConnectService,
        private readonly bookings: CalendarBookingsService,
    ) {}

    @Get()
    @Header("Cache-Control", "no-store")
    status(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<CalendarStatusView> {
        return this.calendars.status(ctx);
    }

    /** Google's consent page, to send the person to. */
    @Post("connect")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    start(@OrgContext() ctx: OrganizationContext): Promise<ConnectStartView> {
        return this.calendars.start(ctx);
    }

    /** One of their Google accounts' calendars, to choose from. */
    @Get("accounts/:accountId/calendars")
    @Header("Cache-Control", "no-store")
    list(
        @OrgContext() ctx: OrganizationContext,
        @Param("accountId") accountId: string,
    ): Promise<GoogleCalendarOptionView[]> {
        return this.calendars.listCalendars(ctx, accountId);
    }

    @Put("accounts/:accountId/calendars")
    @Header("Cache-Control", "no-store")
    choose(
        @OrgContext() ctx: OrganizationContext,
        @Param("accountId") accountId: string,
        @Body() dto: ChooseCalendarsDto,
    ): Promise<CalendarStatusView> {
        return this.calendars.choose(ctx, accountId, dto);
    }

    /** One of their Google accounts stopped; its events stay in Google (DEC-233). */
    @Delete("accounts/:accountId")
    @LifecycleWrite("wind-down")
    @Header("Cache-Control", "no-store")
    disconnectAccount(
        @OrgContext() ctx: OrganizationContext,
        @Param("accountId") accountId: string,
    ): Promise<DisconnectView> {
        return this.calendars.disconnect(ctx, accountId);
    }

    /** Every account of theirs stopped. Never refused for a business that is closing. */
    @Delete()
    @LifecycleWrite("wind-down")
    @Header("Cache-Control", "no-store")
    disconnect(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<DisconnectView> {
        return this.calendars.disconnect(ctx);
    }

    /** Who on the team has connected (owners and admins). */
    @Get("members")
    @Header("Cache-Control", "no-store")
    members(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<CalendarMemberView[]> {
        return this.bookings.members(ctx);
    }

    /** Someone else's connection, stopped by whoever may change their role (GC-03). */
    @Delete("members/:membershipId")
    @LifecycleWrite("wind-down")
    @Header("Cache-Control", "no-store")
    disconnectMember(
        @OrgContext() ctx: OrganizationContext,
        @Param("membershipId") membershipId: string,
    ): Promise<DisconnectView> {
        return this.calendars.disconnectMember(ctx, membershipId);
    }

    /** Their upcoming bookings onto their "bookings go to" calendar (DEC-233). */
    @Post("move-bookings")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    moveBookings(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<MoveBookingsView> {
        return this.bookings.moveBookings(ctx);
    }

    /** The business's default for who may join a Meet (DEC-233). */
    @Put("meet-access")
    @Header("Cache-Control", "no-store")
    meetAccess(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: MeetAccessDto,
    ): Promise<{ meetAccess: MeetAccessDto["meetAccess"]; updating: number }> {
        return this.bookings.setBusinessMeetAccess(ctx, dto.meetAccess);
    }

    /** One booking's Meet and its Google event, as the booking page shows them. */
    @Get("bookings/:bookingId/meeting")
    @Header("Cache-Control", "no-store")
    getBookingMeeting(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
    ): Promise<BookingMeetingView> {
        return this.bookings.bookingMeeting(ctx, bookingId);
    }

    /** One booking's Meet: made, pasted or the service's, and who may join. */
    @Put("bookings/:bookingId/meeting")
    @Header("Cache-Control", "no-store")
    bookingMeeting(
        @OrgContext() ctx: OrganizationContext,
        @Param("bookingId") bookingId: string,
        @Body() dto: BookingMeetingDto,
    ): Promise<BookingMeetingView> {
        return this.bookings.setBookingMeeting(ctx, bookingId, dto);
    }
}

/**
 * Where Google sends the person back (`<api host>/integrations/
 * google-calendar/callback`). A browser lands here, so every outcome is a
 * redirect to the app, never a JSON error: signed out, a bad or expired
 * state, someone else's state, a refusal or Google's own error each say
 * so in the app's address.
 */
// Google holds this address: it is CALLBACK_PATH, which the consent sends.
@Controller("integrations/google-calendar/callback")
export class CalendarCallbackController {
    constructor(
        private readonly calendars: CalendarConnectService,
        private readonly contexts: OrganizationContextService,
    ) {}

    @Get()
    @Header("Cache-Control", "no-store")
    async callback(
        @Query("code") code: string | undefined,
        @Query("state") state: string | undefined,
        @Query("error") error: string | undefined,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        // Local only: Google sent the browser to the bare port, which has no
        // session cookie; send it on to the portless address with the same query.
        const local = env.GOOGLE_CALENDAR_LOCAL_REDIRECT;
        const portless = apiBase(null);
        if (local && portless && req.headers.host === new URL(local).host) {
            const query = req.originalUrl.split("?")[1] ?? "";
            res.redirect(302, `${portless}${CALLBACK_PATH}?${query}`);
            return;
        }
        const session = await auth.api
            .getSession({ headers: fromNodeHeaders(req.headers) })
            .catch(() => null);
        const to = await this.calendars.callback(
            { code, state, error },
            session?.user.id ?? "",
            async (orgId) => {
                const ctx = await this.contexts.resolve(
                    session?.user.id ?? "",
                    orgId,
                );
                // What OrganizationGuard asks of every other write (GC-15).
                assertEditionMatchesAddress(ctx.edition, req.headers.host);
                await assertWorkspaceWrite(orgId, "new");
                return ctx;
            },
        );
        res.redirect(302, to);
    }
}
