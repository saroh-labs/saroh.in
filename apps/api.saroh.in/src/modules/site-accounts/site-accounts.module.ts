import { Module } from "@nestjs/common";

import { AccountLinkingService } from "./account-linking.service";
import { AccountUnlinkService } from "./account-unlink.service";
import { ChallengeVerifier } from "./challenge";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CustomerAccountRepository } from "./customer-account.repository";
import { CustomerSessionGuard } from "./customer-session.guard";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { SignInCodesService } from "./sign-in-codes.service";
import { SignInController } from "./sign-in.controller";
import { SiteRelayGuard } from "./site-relay";

/**
 * A business's customers signing in on its own site (ADR-011, DEC-037;
 * round-2 plan A). A1 laid the tables and the account repository; A2 adds
 * email codes, their limits and the signed relay (`public/site-accounts`);
 * A3 the session, its guard and the customer's RLS context; A4 account ↔
 * contact linking, and "This isn't them", which the customer workspace
 * calls (`AccountUnlinkService`).
 */
@Module({
    controllers: [SignInController, SessionsController],
    providers: [
        CustomerAccountRepository,
        AccountLinkingService,
        AccountUnlinkService,
        ChallengeVerifier,
        SiteCodeAlerts,
        SiteCodeDelivery,
        SessionsService,
        SignInCodesService,
        SiteRelayGuard,
        CustomerSessionGuard,
    ],
    exports: [
        CustomerAccountRepository,
        AccountUnlinkService,
        SiteRelayGuard,
        SessionsService,
        CustomerSessionGuard,
    ],
})
export class SiteAccountsModule {}
