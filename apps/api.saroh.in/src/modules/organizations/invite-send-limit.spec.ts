import { HttpException } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import { InviteSendLimit } from "./invite-send-limit";

const status = (p: Promise<unknown>) =>
    p.then(
        () => 200,
        (e: unknown) => (e instanceof HttpException ? e.getStatus() : 500),
    );

describe("InviteSendLimit (A-02)", () => {
    it("counts every send to one address, so withdraw and re-invite runs out", async () => {
        const limit = new InviteSendLimit(
            new FixedWindowRateLimiter(100, 60_000),
            new FixedWindowRateLimiter(3, 60_000),
        );
        const out = [];
        for (let i = 0; i < 4; i++)
            out.push(await status(limit.take("org-a", "Someone@Example.com")));
        expect(out).toEqual([200, 200, 200, 429]);
        // The address's budget is across businesses, whatever the case.
        await expect(
            status(limit.take("org-b", "someone@example.com")),
        ).resolves.toBe(429);
        await expect(
            status(limit.take("org-b", "other@example.com")),
        ).resolves.toBe(200);
    });

    it("caps a business's sends across addresses", async () => {
        const limit = new InviteSendLimit(
            new FixedWindowRateLimiter(2, 60_000),
            new FixedWindowRateLimiter(100, 60_000),
        );
        await limit.take("org-a", "a@example.com");
        await limit.take("org-a", "b@example.com");
        await expect(
            status(limit.take("org-a", "c@example.com")),
        ).resolves.toBe(429);
        await expect(
            status(limit.take("org-b", "c@example.com")),
        ).resolves.toBe(200);
    });
});
