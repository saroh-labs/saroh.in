import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";

import { auth } from "../../../common/auth/auth";
import { LifecycleWrite } from "../../../common/decorators/lifecycle-write.decorator";
import { OrgContext } from "../../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../../common/guards/organization.guard";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import type { SocialAccessView } from "../access/social-access";
import { SocialAccess } from "../access/social-access";
import { SocialChannelsService } from "./channels.service";
import type { ChannelView, PageChoiceView } from "./dto";
import { ChoosePageDto, kindParam } from "./dto";

/**
 * Saroh Social's access and Channels (U1, U4). No `@RequireModule`:
 * Social is no registry module; the permission, `MODULE_SOCIAL` and the
 * plan are asked in the services (`SocialAccess`). Never cached: every
 * answer is the business's own, now.
 *
 *   GET    …/social                                  access, plan and this month's count
 *   GET    …/social/channels                         the three rows
 *   POST   …/social/channels/:kind/connect           { url } of Meta's consent
 *   GET    …/social/channels/facebook/choices/:id    the Pages to pick from
 *   POST   …/social/channels/facebook/choices/:id    { pageId }: connect it
 *   POST   …/social/channels/:kind/retry             post again what waited for it
 *   DELETE …/social/channels/:kind                   disconnect
 */
@Controller("organizations/:organizationId/social")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class SocialController {
    constructor(
        private readonly access: SocialAccess,
        private readonly channels: SocialChannelsService,
    ) {}

    @Get()
    @Header("Cache-Control", "no-store")
    view(@OrgContext() ctx: OrganizationContext): Promise<SocialAccessView> {
        return this.access.view(ctx);
    }

    @Get("channels")
    @Header("Cache-Control", "no-store")
    list(@OrgContext() ctx: OrganizationContext): Promise<ChannelView[]> {
        return this.channels.list(ctx);
    }

    @Post("channels/:kind/connect")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    connect(
        @OrgContext() ctx: OrganizationContext,
        @Param("kind") kind: string,
    ): Promise<{ url: string }> {
        return this.channels.start(ctx, kindParam(kind));
    }

    @Get("channels/facebook/choices/:choiceId")
    @Header("Cache-Control", "no-store")
    choices(
        @OrgContext() ctx: OrganizationContext,
        @Param("choiceId") choiceId: string,
    ): Promise<PageChoiceView[]> {
        return this.channels.choices(ctx, choiceId);
    }

    @Post("channels/facebook/choices/:choiceId")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    choose(
        @OrgContext() ctx: OrganizationContext,
        @Param("choiceId") choiceId: string,
        @Body() dto: ChoosePageDto,
    ): Promise<ChannelView[]> {
        return this.channels.choose(ctx, choiceId, dto.pageId);
    }

    @Post("channels/:kind/retry")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    retry(
        @OrgContext() ctx: OrganizationContext,
        @Param("kind") kind: string,
    ): Promise<{ queued: number }> {
        return this.channels.retryHeld(ctx, kindParam(kind));
    }

    /** Stopping is never refused for a business that is closing. */
    @Delete("channels/:kind")
    @HttpCode(204)
    @LifecycleWrite("wind-down")
    async disconnect(
        @OrgContext() ctx: OrganizationContext,
        @Param("kind") kind: string,
    ): Promise<void> {
        await this.channels.disconnect(ctx, kindParam(kind));
    }
}

/**
 * Where Meta sends the person back (`<api host>/integrations/<kind>/
 * callback`, the address registered in Meta's app for each login). A
 * browser lands here, so every outcome is a redirect to the app's
 * `/social?tab=channels&channel=<kind>&result=<outcome>`, never a JSON
 * error.
 */
@Controller("integrations")
export class SocialCallbackController {
    constructor(
        private readonly channels: SocialChannelsService,
        private readonly contexts: OrganizationContextService,
    ) {}

    // Named one by one, never `:kind`: other integrations' callbacks
    // (Google Calendar's) live beside these.
    @Get(["instagram/callback", "facebook/callback", "threads/callback"])
    @Header("Cache-Control", "no-store")
    async callback(
        @Query("code") code: string | undefined,
        @Query("state") state: string | undefined,
        @Query("error") error: string | undefined,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const channel = kindParam(req.path.split("/").slice(-2)[0] ?? "");
        const session = await auth.api
            .getSession({ headers: fromNodeHeaders(req.headers) })
            .catch(() => null);
        const to = await this.channels.callback(
            channel,
            { code, state, error },
            session?.user.id ?? "",
            (orgId) => this.contexts.resolve(session?.user.id ?? "", orgId),
        );
        res.redirect(302, to);
    }
}
