import { Module } from "@nestjs/common";

import { sendSiteEmailChangedEmail } from "../../common/email";
import { AccountAreaGuard } from "./account-area";
import {
    AccountHomeService,
    CUSTOMER_NOTES_OPEN,
    CUSTOMER_NOTES_OPEN_DEFAULT,
} from "./account-home.service";
import { AccountLinkingService } from "./account-linking.service";
import { AccountMessagesController } from "./account-messages.controller";
import { AccountOrdersController } from "./account-orders.controller";
import { AccountOrdersService } from "./account-orders.service";
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
import { ThreadsService } from "./threads.service";

/**
 * A business's customers signing in on its own site (ADR-011, DEC-037;
 * round-2 plan A). A1 laid the tables and the account repository; A2 adds
 * email codes, their limits and the signed relay (`public/site-accounts`);
 * A3 the session, its guard and the customer's RLS context; A4 account ↔
 * contact linking, and "This isn't them", which the customer workspace
 * calls (`AccountUnlinkService`). A5 adds the account area (`/me`: Me,
 * Home, receipts, health notes and the email change), dark behind
 * `SITE_ACCOUNT_AREA` until A6–A8 and A13 ship with it. A7 adds Orders
 * and Track (`/me/orders`). A6's Bookings (`/me/bookings`) are served by
 * `BookingsModule`, which owns the booking writes they share with the team.
 * A13 adds the customer's message thread (`/me/messages`), which the
 * workspace answers through the exported `ThreadsService`.
 */
@Module({
    controllers: [
        SignInController,
        SessionsController,
        AccountController,
        AccountOrdersController,
        AccountMessagesController,
    ],
    providers: [
        AccountOrdersService,
        CustomerAccountRepository,
        AccountLinkingService,
        AccountUnlinkService,
        AccountAreaGuard,
        AccountHomeService,
        EmailChangeService,
        // Health notes: open since A13 worded C12's staff card per source.
        { provide: CUSTOMER_NOTES_OPEN, useValue: CUSTOMER_NOTES_OPEN_DEFAULT },
        { provide: EMAIL_CHANGED_SENDER, useValue: sendSiteEmailChangedEmail },
        ChallengeVerifier,
        SiteCodeAlerts,
        SiteCodeDelivery,
        SessionsService,
        SignInCodesService,
        SiteRelayGuard,
        CustomerSessionGuard,
        ThreadsService,
    ],
    exports: [
        AccountAreaGuard,
        CustomerAccountRepository,
        AccountUnlinkService,
        SiteRelayGuard,
        SessionsService,
        CustomerSessionGuard,
        ThreadsService,
        AccountAreaGuard,
    ],
})
export class SiteAccountsModule {}
