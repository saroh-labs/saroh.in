// Pure unit test: the email helper is mocked so nothing touches SMTP or the
// network, and no Prisma is used at all (this feature is account-level state).
jest.mock("../../common/email", () => ({
    sendSelfTestEmail: jest.fn().mockResolvedValue(undefined),
}));

import { ForbiddenException, HttpException } from "@nestjs/common";

import { sendSelfTestEmail } from "../../common/email";
import type { AuthUser } from "../../common/types/store-context";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { SelfTestService } from "./self-test.service";

const sendEmail = sendSelfTestEmail as jest.Mock;

const verifiedUser: AuthUser = {
    id: "user_1",
    email: "ada@example.com",
    name: "Ada",
    emailVerified: true,
};

function makeService(limit = 5): SelfTestService {
    // Real limiter (deterministic per-userId), real email helper reference
    // (which is the jest mock above).
    return new SelfTestService(
        new FixedWindowRateLimiter(limit, 60 * 60_000),
        sendSelfTestEmail,
    );
}

describe("SelfTestService (S6-004)", () => {
    beforeEach(() => {
        sendEmail.mockClear();
    });

    it("sends ONLY to the session user's own verified email (recipient is never taken from input)", async () => {
        const service = makeService();

        const result = await service.sendSelfTest(verifiedUser, "welcome");

        // The email helper was called with the SESSION user's address, full stop.
        expect(sendEmail).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledWith(
            "ada@example.com",
            expect.objectContaining({ templateLabel: expect.any(String) }),
        );
        // Response echoes back only the (redacted) user's own email + template.
        expect(result).toEqual({
            sentTo: "a***@example.com",
            template: "welcome",
        });
    });

    it("cannot be pointed at an arbitrary recipient — the address comes from the AuthUser, not any body field", async () => {
        const service = makeService();

        // Even if a caller somehow attached extra fields to the "request", the
        // service only ever reads `user.email`. We simulate a hostile body by
        // casting; the recipient the helper receives is still the user's.
        const hostileUser = {
            ...verifiedUser,
            // These would be attacker-controlled body fields in a naive design.
            to: "victim@evil.com",
            recipient: "victim@evil.com",
            email: "ada@example.com",
        } as unknown as AuthUser;

        await service.sendSelfTest(hostileUser, "welcome");

        expect(sendEmail).toHaveBeenCalledTimes(1);
        const [recipient] = sendEmail.mock.calls[0] as [string, unknown];
        expect(recipient).toBe("ada@example.com");
        expect(recipient).not.toBe("victim@evil.com");
    });

    it("refuses (403) when the account email is NOT verified, and sends nothing", async () => {
        const service = makeService();
        const unverified: AuthUser = { ...verifiedUser, emailVerified: false };

        await expect(
            service.sendSelfTest(unverified, "welcome"),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("rate-limits per user: the N+1th send within the window is refused (429)", async () => {
        const service = makeService(2); // 2 per window

        await service.sendSelfTest(verifiedUser, "welcome");
        await service.sendSelfTest(verifiedUser, "welcome");

        const third = service.sendSelfTest(verifiedUser, "welcome");
        await expect(third).rejects.toBeInstanceOf(HttpException);
        await expect(third).rejects.toHaveProperty("status", 429);

        // Only the two allowed sends went out.
        expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("labels the send with the chosen template's preview label", async () => {
        const service = makeService();

        await service.sendSelfTest(verifiedUser, "receipt");

        expect(sendEmail).toHaveBeenCalledWith(
            "ada@example.com",
            expect.objectContaining({
                templateLabel: "Order receipt preview",
                html: expect.stringContaining("receipt"),
            }),
        );
    });
});
