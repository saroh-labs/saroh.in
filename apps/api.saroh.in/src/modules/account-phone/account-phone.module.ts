import { Module } from "@nestjs/common";

import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { MessagingModule } from "../messaging/messaging.module";
import { ChallengeVerifier } from "../site-accounts/challenge";
import {
    AccountPhoneController,
    PhoneSignInController,
} from "./account-phone.controller";
import { AccountPhoneService } from "./account-phone.service";

/** Phone sign-in for Saroh accounts (DEC-196). */
@Module({
    imports: [MessagingModule, FeatureFlagModule],
    controllers: [PhoneSignInController, AccountPhoneController],
    providers: [AccountPhoneService, ChallengeVerifier],
})
export class AccountPhoneModule {}
