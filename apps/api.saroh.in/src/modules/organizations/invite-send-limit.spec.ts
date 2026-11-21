import { HttpException } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import { InviteSendLimit, inviteAddressKey } from "./invite-send-limit";

const status = (p: Promise<unknown>) =>
    p.then(
        () => 200,
        (e: unknown) => (e instanceof HttpException ? e.getStatus() : 500),
    );

const w = (limit: number) => new FixedWindowRateLimiter(limit, 60_000);
const roomy = () => ({
    business: w(100),
    businessAddress: w(100),
    address: w(100),
    inviter: w(100),
    overall: w(1000),
    overallAlerted: w(1),
});
const alerts = () => ({ send: jest.fn().mockResolvedValue(1) });

describe("inviteAddressKey (07 F4)", () => {
    it("reads one address however it is written", () => {
        expect(inviteAddressKey(" Some.One+x@Example.com ")).toBe(
            "some.one@example.com",
        );
        expect(inviteAddressKey("s.o.m.e+1@googlemail.com")).toBe(
            "some@gmail.com",
        );
        expect(inviteAddressKey("SOME@gmail.com")).toBe("some@gmail.com");
        expect(inviteAddressKey('"some"@example.com')).toBe("some@example.com");
        expect(inviteAddressKey("not-an-address")).toBe("not-an-address");
    });
});

describe("InviteSendLimit (A-02, 07 F4)", () => {
    it("counts every send to one address, written any way, so withdraw and re-invite runs out", async () => {
        const limit = new InviteSendLimit({
            ...roomy(),
            businessAddress: w(3),
        });
        const out = [];
        for (const to of [
            "Someone@gmail.com",
            "some.one@gmail.com",
            "someone+2@googlemail.com",
            "someone+3@gmail.com",
        ])
            out.push(await status(limit.take("org-a", "u1", to)));
        expect(out).toEqual([200, 200, 200, 429]);
        // Another business still reaches them: a stranger can't block it.
        await expect(
            status(limit.take("org-b", "u2", "someone@gmail.com")),
        ).resolves.toBe(200);
    });

    it("caps one address across every business, above one business's share", async () => {
        const limit = new InviteSendLimit({
            ...roomy(),
            businessAddress: w(2),
            address: w(3),
        });
        await limit.take("org-a", "u1", "x@example.com");
        await limit.take("org-a", "u1", "x@example.com");
        await expect(
            status(limit.take("org-a", "u1", "x@example.com")),
        ).resolves.toBe(429);
        await expect(
            status(limit.take("org-b", "u2", "x@example.com")),
        ).resolves.toBe(200);
        await expect(
            status(limit.take("org-c", "u3", "x@example.com")),
        ).resolves.toBe(429);
    });

    it("caps a business's sends across addresses", async () => {
        const limit = new InviteSendLimit({ ...roomy(), business: w(2) });
        await limit.take("org-a", "u1", "a@example.com");
        await limit.take("org-a", "u1", "b@example.com");
        await expect(
            status(limit.take("org-a", "u1", "c@example.com")),
        ).resolves.toBe(429);
        await expect(
            status(limit.take("org-b", "u1", "c@example.com")),
        ).resolves.toBe(200);
    });

    it("caps one account across the businesses it invites for", async () => {
        const limit = new InviteSendLimit({ ...roomy(), inviter: w(2) });
        await limit.take("org-a", "u1", "a@example.com");
        await limit.take("org-b", "u1", "b@example.com");
        await expect(
            status(limit.take("org-c", "u1", "c@example.com")),
        ).resolves.toBe(429);
    });

    it("never refuses past the overall line, and alerts staff once (L8)", async () => {
        const sender = alerts();
        const all = new InviteSendLimit({ ...roomy(), overall: w(1) }, sender);
        const out = [];
        for (const org of ["org-a", "org-b", "org-c"])
            out.push(await status(all.take(org, org, `${org}@example.com`)));
        expect(out).toEqual([200, 200, 200]);
        expect(sender.send).toHaveBeenCalledTimes(1);
    });
});
