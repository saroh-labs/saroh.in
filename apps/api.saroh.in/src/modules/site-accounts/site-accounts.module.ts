import { Module } from "@nestjs/common";

import { sendSiteEmailChangedEmail } from "../../common/email";
import { AccountAreaGuard } from "./account-area";
import {
    AccountHomeService,
    CUSTOMER_NOTES_OPEN,
    CUSTOMER_NOTES_OPEN_DEFAULT,
} from "./account-home.service";
import { AccountLinkingService } from "./account-linking.service";
import { AccountUnlinkService } from "./account-unlink.service";
import { AccountController } from "./account.controller";
import { ChallengeVerifier } from "./challenge";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CustomerAccountRepository } from "./customer-account.repository";
import { CustomerSessionGuard } from "./customer-session.guard";
import {
    EMAIL_CHANGED_SENDER,
    EmailChangeService,
} from "./email-change.service";
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
 * calls (`AccountUnlinkService`). A5 adds the account area (`/me`: Me,
 * Home, receipts, health notes and the email change), dark behind
 * `SITE_ACCOUNT_AREA` until A6–A8 and A13 ship with it.
 */
@Module({
    controllers: [SignInController, SessionsController, AccountController],
    providers: [
        CustomerAccountRepository,
        AccountLinkingService,
        AccountUnlinkService,
        AccountAreaGuard,
        AccountHomeService,
        EmailChangeService,
        // Health notes stay closed until C12; tests open them here.
        { provide: CUSTOMER_NOTES_OPEN, useValue: CUSTOMER_NOTES_OPEN_DEFAULT },
        { provide: EMAIL_CHANGED_SENDER, useValue: sendSiteEmailChangedEmail },
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
