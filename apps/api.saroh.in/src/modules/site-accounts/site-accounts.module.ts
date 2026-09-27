import { Module } from "@nestjs/common";

import { AccountLinkingService } from "./account-linking.service";
import { ChallengeVerifier } from "./challenge";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CustomerAccountRepository } from "./customer-account.repository";
import { SignInCodesService } from "./sign-in-codes.service";
import { SignInController } from "./sign-in.controller";
import { SiteRelayGuard } from "./site-relay";

/**
 * A business's customers signing in on its own site (ADR-011, DEC-037;
 * round-2 plan A). A1 laid the tables and the account repository; A2 adds
 * email codes, their limits and the signed relay (`public/site-accounts`).
 * The session guard (A3) and account ↔ contact linking (A4) build on these.
 */
@Module({
    controllers: [SignInController],
    providers: [
        CustomerAccountRepository,
        AccountLinkingService,
        ChallengeVerifier,
        SiteCodeAlerts,
        SiteCodeDelivery,
        SignInCodesService,
        SiteRelayGuard,
    ],
    exports: [CustomerAccountRepository, SiteRelayGuard],
})
export class SiteAccountsModule {}
