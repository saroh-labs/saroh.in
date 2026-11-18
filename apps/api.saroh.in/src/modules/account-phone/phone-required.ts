import { Injectable, Module } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { MessagingCoreModule } from "../messaging/messaging-core.module";
import { MessagingService } from "../messaging/messaging.service";
import { isSarohStaff } from "./saroh-staff";

/**
 * `PHONE_REQUIRED_FOR_ACCOUNTS` (DEC-196), checked by the API (03-M5). The
 * accounts app only redirects to "Add your phone" after sign-in, and the
 * session is good for every app, so opening the workspace directly skipped
 * it. The API holds the step where a new account first needs the API: an
 * India business can't be set up until the person has a verified phone.
 *
 * Not on every workspace request (`OrganizationGuard`): that would cost a
 * flag and user read per call, and lock existing members out mid-session;
 * the accounts app asks them at their next sign-in, as it always has.
 *
 * Mirrors the accounts step exactly: never while codes can't be sent (the
 * step lets them go on then), and never Saroh's own staff.
 */
@Injectable()
export class PhoneRequirement {
    constructor(
        private readonly messaging: MessagingService,
        private readonly flags: FeatureFlagService,
    ) {}

    /** Whether this person must add a phone before going on. */
    async missing(user: { id: string; email: string }): Promise<boolean> {
        if (
            !(await this.flags.isEnabled(FlagKey.PHONE_REQUIRED_FOR_ACCOUNTS))
        ) {
            return false;
        }
        const available =
            this.messaging.whatsappOtpReady ||
            this.messaging.otpStandIn ||
            this.messaging.otpWidgetConfig() !== null;
        if (!available) return false;
        const row = await prisma.user.findUnique({
            where: { id: user.id },
            select: { phoneVerifiedAt: true },
        });
        if (row?.phoneVerifiedAt) return false;
        return !(await isSarohStaff(user));
    }
}

/** {@link PhoneRequirement}, for modules that set a person up (no billing wiring). */
@Module({
    imports: [MessagingCoreModule, FeatureFlagModule],
    providers: [PhoneRequirement],
    exports: [PhoneRequirement],
})
export class PhoneRequirementModule {}
