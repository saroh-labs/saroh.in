import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
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
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { CalendarConnectService } from "./calendar-connect.service";
import type {
    CalendarStatusView,
    ConnectStartView,
    GoogleCalendarOptionView,
} from "./dto";
import { ChooseCalendarsDto } from "./dto";

/**
 * A person's own Google Calendar in this business (#1047, U4). The flag,
 * the plan and `calendar:connect-own` are checked in the service. Never
 * cached: each answer is the person's own.
 */
@Controller("organizations/:organizationId/calendar/google")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class CalendarConnectController {
    constructor(private readonly calendars: CalendarConnectService) {}

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

    @Get("calendars")
    @Header("Cache-Control", "no-store")
    list(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<GoogleCalendarOptionView[]> {
        return this.calendars.listCalendars(ctx);
    }

    @Put("calendars")
    @Header("Cache-Control", "no-store")
    choose(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: ChooseCalendarsDto,
    ): Promise<CalendarStatusView> {
        return this.calendars.choose(ctx, dto);
    }

    /** Stopping is never refused for a business that is closing. */
    @Delete()
    @LifecycleWrite("wind-down")
    @Header("Cache-Control", "no-store")
    disconnect(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<CalendarStatusView> {
        return this.calendars.disconnect(ctx);
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
        const session = await auth.api
            .getSession({ headers: fromNodeHeaders(req.headers) })
            .catch(() => null);
        const to = await this.calendars.callback(
            { code, state, error },
            session?.user.id ?? "",
            (orgId) => this.contexts.resolve(session?.user.id ?? "", orgId),
        );
        res.redirect(302, to);
    }
}
