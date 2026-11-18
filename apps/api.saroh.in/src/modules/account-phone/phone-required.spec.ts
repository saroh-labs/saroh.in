const findUser = jest.fn();
const findGrant = jest.fn();
jest.mock("@saroh/database", () => ({
    prisma: {
        user: { findUnique: (...a: unknown[]) => findUser(...a) as unknown },
        platformAdmin: {
            findUnique: (...a: unknown[]) => findGrant(...a) as unknown,
        },
    },
}));

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { MessagingService } from "../messaging/messaging.service";
import { PhoneRequirement } from "./phone-required";

// 03-M5: the phone step was only an accounts redirect; opening the
// workspace directly skipped it.
describe("PhoneRequirement", () => {
    function requirement(input: { on: boolean; available: boolean }) {
        const flags = {
            isEnabled: jest.fn().mockResolvedValue(input.on),
        } as unknown as FeatureFlagService;
        const messaging = {
            whatsappOtpReady: input.available,
            otpStandIn: false,
            otpWidgetConfig: () => null,
        } as unknown as MessagingService;
        return new PhoneRequirement(messaging, flags);
    }
    const person = { id: "u1", email: "asha@example.com" };

    beforeEach(() => {
        findUser.mockReset().mockResolvedValue({ phoneVerifiedAt: null });
        findGrant.mockReset().mockResolvedValue(null);
    });

    it("holds a person with no verified phone while the switch is on", async () => {
        await expect(
            requirement({ on: true, available: true }).missing(person),
        ).resolves.toBe(true);
    });

    it("lets them go on with a verified phone, the switch off, or codes down", async () => {
        await expect(
            requirement({ on: false, available: true }).missing(person),
        ).resolves.toBe(false);
        await expect(
            requirement({ on: true, available: false }).missing(person),
        ).resolves.toBe(false);
        findUser.mockResolvedValue({ phoneVerifiedAt: new Date() });
        await expect(
            requirement({ on: true, available: true }).missing(person),
        ).resolves.toBe(false);
    });

    it("never holds Saroh's own staff", async () => {
        findGrant.mockResolvedValue({ revokedAt: null });
        await expect(
            requirement({ on: true, available: true }).missing(person),
        ).resolves.toBe(false);
    });
});
