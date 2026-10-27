import {
    BadRequestException,
    Body,
    Controller,
    Get,
    GoneException,
    Header,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { authorize } from "../organizations/organization-policy";
import { resolveSiteHost } from "../site-accounts/site-host";
import type { SiteRelay } from "../site-accounts/site-relay";
import { RelayContext, SiteRelayGuard } from "../site-accounts/site-relay";
import {
    CheckVerificationDto,
    LedgerQueryDto,
    SetVerificationSettingDto,
    StartTopupDto,
    StartVerificationDto,
} from "./dto";
import { TopupService } from "./topup.service";
import { VerificationSendService } from "./verification-send.service";
import type { CheckOutcome } from "./verification.service";
import { VerificationService } from "./verification.service";
import { WalletService } from "./wallet.service";

/**
 * The business's side of Saroh-sent codes (DEC-191, #1242): which modules
 * send them, the balance that pays for them and how many get verified.
 * Every route needs `comms:manage`; the business is the guard's proven one.
 */
@Controller("organizations/:organizationId/messaging")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class MessagingController {
    constructor(
        private readonly verification: VerificationService,
        private readonly wallet: WalletService,
        private readonly topups: TopupService,
    ) {}

    @Get("verification-settings")
    settings(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "comms:manage");
        return this.verification.settings(ctx.organizationId);
    }

    @Put("verification-settings")
    setSetting(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: SetVerificationSettingDto,
    ) {
        authorize(ctx, "comms:manage");
        return this.verification.setEnabled(
            ctx.organizationId,
            dto.module,
            dto.enabled,
        );
    }

    @Get("wallet")
    walletView(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "comms:manage");
        return this.wallet.get(ctx.organizationId);
    }

    @Get("wallet/ledger")
    ledger(
        @OrgContext() ctx: OrganizationContext,
        @Query() query: LedgerQueryDto,
    ) {
        authorize(ctx, "comms:manage");
        return this.wallet.ledger(ctx.organizationId, query);
    }

    /** The money packs on sale (#1241), from the live catalogue. */
    @Get("packs")
    packs(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "comms:manage");
        return this.topups.packs();
    }

    /** Buy a pack: owner only (`billing:manage`), as every Saroh charge. */
    @Post("topups")
    @HttpCode(HttpStatus.CREATED)
    startTopup(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: StartTopupDto,
    ) {
        return this.topups.start(ctx, dto.packId);
    }

    @Get("topups/:id")
    @Header("Cache-Control", "no-store")
    topup(@OrgContext() ctx: OrganizationContext, @Param("id") id: string) {
        return this.topups.status(ctx, id);
    }

    /** Sessions started and verified over the last 30 days. */
    @Get("summary")
    summary(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "comms:manage");
        return this.verification.successRate(ctx.organizationId);
    }
}

const CHECK_REFUSALS: Record<Exclude<CheckOutcome, "verified">, () => Error> = {
    wrong_code: () =>
        new BadRequestException({
            message: "That code isn't right. Check it and try again.",
            details: { code: "WRONG_CODE", field: "code" },
        }),
    expired: () =>
        new GoneException({
            message: "That code has expired. Ask for a new one.",
            details: { code: "EXPIRED" },
        }),
    too_many_attempts: () =>
        new GoneException({
            message: "Too many wrong tries. Ask for a new code.",
            details: { code: "TOO_MANY_ATTEMPTS" },
        }),
    already_verified: () =>
        new GoneException({
            message: "That code has been used. Ask for a new one.",
            details: { code: "ALREADY_USED" },
        }),
    not_found: () => new NotFoundException("No such code was sent."),
};

/**
 * A customer on a business's site asking for a code and checking it
 * (DEC-191, #1242). Server-to-server behind the signed site relay, as site
 * sign-in is: the business comes from the relayed host and the address the
 * abuse limits count is the relayed visitor's, hashed. The code itself is
 * never in an answer. A demo or closed business sends nothing (DEC-188).
 */
@Controller("public/site-accounts/verifications")
@UseGuards(SiteRelayGuard)
export class PublicVerificationsController {
    constructor(
        private readonly send: VerificationSendService,
        private readonly verification: VerificationService,
    ) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Header("Cache-Control", "no-store")
    async start(
        @RelayContext() relay: SiteRelay,
        @Body() dto: StartVerificationDto,
    ): Promise<{ verificationId: string; expiresAt: Date }> {
        // Sign-in codes go through site sign-in, which asks the challenge
        // and opens the session (DEC-196); a bare ACCOUNT code proves nothing.
        if (dto.module === "ACCOUNT") {
            throw new BadRequestException({
                message: "Sign-in codes are asked for through sign-in.",
                details: { field: "module" },
            });
        }
        const site = await resolveSiteHost(relay.host);
        await assertOrganizationOpen(site.organizationId);
        return this.send.sendCode({
            organizationId: site.organizationId,
            module: dto.module,
            phoneE164: dto.phone,
            subjectRef: dto.subjectRef,
            ipHash: relay.clientHash,
        });
    }

    @Post(":id/check")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    async check(
        @RelayContext() relay: SiteRelay,
        @Param("id") id: string,
        @Body() dto: CheckVerificationDto,
    ): Promise<{ status: "VERIFIED" }> {
        const site = await resolveSiteHost(relay.host);
        await assertOrganizationOpen(site.organizationId);
        const outcome = await this.verification.check({
            organizationId: site.organizationId,
            verificationId: id,
            code: dto.code,
        });
        if (outcome !== "verified") throw CHECK_REFUSALS[outcome]();
        return { status: "VERIFIED" };
    }
}
