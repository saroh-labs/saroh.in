import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Post,
    Query,
    Req,
    UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { ZodContractPipe } from "../../common/pipes/zod-contract.pipe";
import type {
    ConsentDetails,
    FlowCaller,
    PickableBusiness,
} from "./oauth-flow.service";
import { OAuthFlowService } from "./oauth-flow.service";

const pickBody = z.object({
    organizationIds: z.array(z.string().min(1).max(64)).min(1).max(200),
    oauthQuery: z.string().min(1).max(8192),
});
const consentBody = z.object({
    accept: z.boolean(),
    oauthQuery: z.string().min(1).max(8192),
});

type SessionRequest = Request & {
    user?: { id: string };
    session?: { id: string };
};

const callerOf = (req: SessionRequest): FlowCaller => ({
    userId: req.user?.id ?? "",
    sessionId: req.session?.id ?? "",
    host: req.headers.host,
    cookie: req.headers.cookie,
});

/**
 * The accounts pages' API for an AI app's sign-in (U9): which businesses to
 * offer, the pick, the consent's details and the Allow or Deny. Signed-in
 * people only; never cached (the answers carry signed sign-in state).
 */
@Controller("oauth")
@UseGuards(BetterAuthGuard)
export class OAuthFlowController {
    constructor(private readonly flow: OAuthFlowService) {}

    @Get("businesses")
    @Header("Cache-Control", "no-store")
    businesses(@Req() req: SessionRequest): Promise<PickableBusiness[]> {
        return this.flow.businesses(callerOf(req));
    }

    @Post("pick")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    pick(
        @Req() req: SessionRequest,
        @Body(new ZodContractPipe(pickBody)) body: z.infer<typeof pickBody>,
    ): Promise<{ url: string }> {
        return this.flow.pick(
            callerOf(req),
            body.organizationIds,
            body.oauthQuery,
        );
    }

    @Get("consent")
    @Header("Cache-Control", "no-store")
    consentDetails(
        @Req() req: SessionRequest,
        @Query("oauthQuery") oauthQuery = "",
    ): Promise<ConsentDetails> {
        return this.flow.consentDetails(callerOf(req), oauthQuery);
    }

    @Post("consent")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    consent(
        @Req() req: SessionRequest,
        @Body(new ZodContractPipe(consentBody))
        body: z.infer<typeof consentBody>,
    ): Promise<{ url: string }> {
        return this.flow.consent(callerOf(req), body.accept, body.oauthQuery);
    }
}
