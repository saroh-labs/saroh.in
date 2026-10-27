import { Module } from "@nestjs/common";

import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { PricingModule } from "../pricing/pricing.module";
import { SignInWaysService } from "../site-accounts/sign-in-ways";
import { MessagingService } from "./messaging.service";
import { messagingProviderProvider } from "./providers/messaging-provider.factory";
import { VerificationSendService } from "./verification-send.service";
import { VerificationService } from "./verification.service";
import { WalletService } from "./wallet.service";

/**
 * Sending and checking Saroh-sent codes against the prepaid balance, with
 * none of the business's own routes (DEC-191): what site sign-in needs
 * (DEC-196) without the top-up's billing wiring, which `MessagingModule`
 * adds on top.
 */
@Module({
    imports: [FeatureFlagModule, PricingModule],
    providers: [
        messagingProviderProvider,
        MessagingService,
        VerificationService,
        VerificationSendService,
        WalletService,
        // The ways a business's customers sign in (DEC-196): site sign-in
        // reads it, the business's messaging settings write it.
        SignInWaysService,
    ],
    exports: [
        MessagingService,
        VerificationService,
        VerificationSendService,
        WalletService,
        SignInWaysService,
    ],
})
export class MessagingCoreModule {}
