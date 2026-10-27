jest.mock("@saroh/database", () => ({ prisma: {} }));
jest.mock("@saroh/auth", () => ({ startPhoneSession: jest.fn() }));
jest.mock("../../common/auth/auth", () => ({ auth: {} }));

import { Logger } from "@nestjs/common";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { MessagingService } from "../messaging/messaging.service";
import type { ChallengeVerifier } from "../site-accounts/challenge";
import { AccountPhoneService } from "./account-phone.service";

/**
 * `GET /account-phone/options` carries the platform switch
 * (`PHONE_REQUIRED_FOR_ACCOUNTS`, DEC-196) that accounts reads on its
 * server to decide whether sign-in stops at "Add your phone".
 */
function service(input: { flagOn: boolean; widget: boolean }) {
    const isEnabled = jest.fn().mockResolvedValue(input.flagOn);
    const messaging = {
        otpStandIn: false,
        otpWidgetConfig: () =>
            input.widget
                ? { widgetId: "w", tokenAuth: "t", scriptUrl: "s" }
                : null,
    } as unknown as MessagingService;
    const challenge = { siteKey: null } as unknown as ChallengeVerifier;
    const flags = { isEnabled } as unknown as FeatureFlagService;
    return {
        phones: new AccountPhoneService(messaging, challenge, flags),
        isEnabled,
    };
}

describe("AccountPhoneService.options", () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, "warn")
            .mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it("off: the phone stays optional", async () => {
        const { phones, isEnabled } = service({ flagOn: false, widget: true });
        expect(await phones.options()).toEqual({
            available: true,
            turnstileSiteKey: null,
            required: false,
        });
        // Platform-wide: asked with no organization, so only the global default counts.
        expect(isEnabled).toHaveBeenCalledWith(
            FlagKey.PHONE_REQUIRED_FOR_ACCOUNTS,
        );
        expect(warn).not.toHaveBeenCalled();
    });

    it("on: required, and available when codes can be sent", async () => {
        const { phones } = service({ flagOn: true, widget: true });
        expect(await phones.options()).toMatchObject({
            available: true,
            required: true,
        });
    });

    it("on with no way to send: says so and logs it, so accounts lets people through", async () => {
        const { phones } = service({ flagOn: true, widget: false });
        expect(await phones.options()).toMatchObject({
            available: false,
            required: true,
        });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("account_phone_required_unavailable"),
        );
    });
});
