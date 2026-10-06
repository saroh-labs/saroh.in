/**
 * Opening-day invites (marketing plan U31), without a database: an entry is
 * claimed before its email goes, a failed send is released, a token is
 * bound to the entry's email, single use and expiring, and the offer's
 * length comes from the environment. `invites.db.spec.ts` runs the same
 * rules against Postgres. Every value is made up.
 */
jest.mock("@saroh/database", () => {
    const prisma = {
        waitlistSignup: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
        },
        subscription: { findUnique: jest.fn() },
        entitlementOverride: { create: jest.fn(), findFirst: jest.fn() },
        auditEvent: { create: jest.fn() },
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
        (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    return { prisma };
});
jest.mock("../../env", () => ({
    env: {
        ACCOUNTS_URL: "https://accounts.example.test/",
        NODE_ENV: "test",
        LAUNCH_OFFER_DAYS: 37,
    },
}));
jest.mock("../../common/email", () => ({
    sendWaitlistLaunchInviteEmail: jest.fn(),
}));

import { ForbiddenException, GoneException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendWaitlistLaunchInviteEmail } from "../../common/email";
import type { AuthUser } from "../../common/types/store-context";
import { env } from "../../env";
import { hashInviteToken, INVITE_VALID_DAYS } from "./invite-token";
import { WaitlistInvitesService } from "./invites.service";
import { INVITE_REFUSALS, LaunchOfferService } from "./launch-offer.service";

const signups = prisma.waitlistSignup as unknown as Record<string, jest.Mock>;
const send = sendWaitlistLaunchInviteEmail as jest.Mock;
const overrides = prisma.entitlementOverride as unknown as Record<
    string,
    jest.Mock
>;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2031-03-03T10:00:00Z");

const waiting = {
    id: "w1",
    email: "asha@example.test",
    businessName: "Asha Salon",
    invitedAt: null,
    inviteSentAt: null,
    joinedAt: null,
};

beforeEach(() => {
    jest.clearAllMocks();
    (env as { LAUNCH_OFFER_DAYS?: number }).LAUNCH_OFFER_DAYS = 37;
});

describe("WaitlistInvitesService.sendOne", () => {
    const invites = new WaitlistInvitesService();

    it("claims the entry with a fresh token's hash before the email goes, then records it sent", async () => {
        signups.findMany!.mockResolvedValue([waiting]);
        signups.findUnique!.mockResolvedValue(waiting);
        signups.updateMany!.mockResolvedValue({ count: 1 });
        send.mockResolvedValue("sent");

        await expect(invites.sendOne("w1", NOW)).resolves.toEqual({
            status: "DONE",
            detail: "Invite sent",
        });

        const claim = signups.updateMany!.mock.calls[0]![0] as {
            where: Record<string, unknown>;
            data: { inviteTokenHash: string; inviteExpiresAt: Date };
        };
        expect(claim.where).toMatchObject({
            id: "w1",
            joinedAt: null,
            inviteSentAt: null,
        });
        expect(claim.data.inviteExpiresAt.getTime()).toBe(
            NOW.getTime() + INVITE_VALID_DAYS * DAY_MS,
        );
        const [to, details] = send.mock.calls[0] as [string, { url: string }];
        expect(to).toBe("asha@example.test");
        const url = new URL(details.url);
        expect(url.origin + url.pathname).toBe(
            "https://accounts.example.test/signup",
        );
        const token = url.searchParams.get("invite")!;
        expect(claim.data.inviteTokenHash).toBe(hashInviteToken(token));
        expect(url.searchParams.get("email")).toBe("asha@example.test");
        // The claim came before the send; "sent" is recorded after it.
        expect(signups.updateMany!.mock.invocationCallOrder[0]).toBeLessThan(
            send.mock.invocationCallOrder[0]!,
        );
        expect(signups.updateMany!.mock.calls[1]![0]).toMatchObject({
            where: { id: "w1", inviteTokenHash: claim.data.inviteTokenHash },
            data: { inviteSentAt: expect.any(Date) },
        });
    });

    it("releases an entry whose email did not leave, so it is still waiting", async () => {
        signups.findMany!.mockResolvedValue([waiting]);
        signups.findUnique!.mockResolvedValue(waiting);
        signups.updateMany!.mockResolvedValue({ count: 1 });
        send.mockResolvedValue("failed");

        await expect(invites.sendOne("w1", NOW)).resolves.toMatchObject({
            status: "FAILED",
        });
        expect(signups.updateMany!.mock.calls[1]![0]).toMatchObject({
            data: {
                invitedAt: null,
                inviteTokenHash: null,
                inviteExpiresAt: null,
            },
        });
    });

    it("skips an entry already invited, sending nothing", async () => {
        signups.findMany!.mockResolvedValue([
            { ...waiting, invitedAt: NOW, inviteSentAt: NOW },
        ]);
        await expect(invites.sendOne("w1", NOW)).resolves.toMatchObject({
            status: "SKIPPED",
        });
        expect(send).not.toHaveBeenCalled();
        expect(signups.updateMany).not.toHaveBeenCalled();
    });

    it("skips an entry another batch claimed between the dry run and now", async () => {
        signups.findMany!.mockResolvedValue([waiting]);
        signups.updateMany!.mockResolvedValue({ count: 0 });
        await expect(invites.sendOne("w1", NOW)).resolves.toMatchObject({
            status: "SKIPPED",
        });
        expect(send).not.toHaveBeenCalled();
    });

    it("refuses the whole batch, saying why, without an offer length", async () => {
        (env as { LAUNCH_OFFER_DAYS?: number }).LAUNCH_OFFER_DAYS = undefined;
        signups.findMany!.mockResolvedValue([waiting]);
        const [item] = await invites.classify(["w1"], NOW);
        expect(item).toMatchObject({ verdict: "unsafe" });
        expect(item?.detail).toContain("LAUNCH_OFFER_DAYS");
        await expect(invites.sendOne("w1", NOW)).resolves.toMatchObject({
            status: "FAILED",
        });
        expect(send).not.toHaveBeenCalled();
    });
});

describe("LaunchOfferService", () => {
    const offers = new LaunchOfferService();
    const token = "t".repeat(43);
    const invited = {
        id: "w1",
        emailKey: "hari@gmail.com",
        businessName: "Hari Store",
        inviteExpiresAt: new Date(NOW.getTime() + DAY_MS),
        joinedAt: null,
        joinedOrganizationId: null,
    };
    const hari: AuthUser = {
        id: "u1",
        email: "H.a.r.i+shop@gmail.com",
        emailVerified: true,
    };
    const ctx = {
        organizationId: "org1",
        userId: "u1",
        role: "OWNER" as const,
    };

    it("checks the invite for the address its sign-up code was checked against", async () => {
        signups.findUnique!.mockResolvedValue(invited);
        await expect(offers.check(hari, token, NOW)).resolves.toEqual({
            status: "ready",
            businessName: "Hari Store",
            planKey: "grow",
            days: 37,
        });
        await expect(
            offers.check(
                { ...hari, email: "someone@example.test" },
                token,
                NOW,
            ),
        ).resolves.toEqual({
            status: "other-email",
            message: INVITE_REFUSALS.otherEmail,
        });
        await expect(
            offers.check({ ...hari, emailVerified: false }, token, NOW),
        ).resolves.toMatchObject({ status: "unverified" });
    });

    it("refuses a used or expired link before comparing addresses, so it says nothing about whose it was", async () => {
        const stranger = { ...hari, email: "someone@example.test" };
        signups.findUnique!.mockResolvedValue({ ...invited, joinedAt: NOW });
        await expect(offers.check(stranger, token, NOW)).resolves.toMatchObject(
            { status: "used" },
        );
        signups.findUnique!.mockResolvedValue({
            ...invited,
            inviteExpiresAt: NOW,
        });
        await expect(offers.check(stranger, token, NOW)).resolves.toMatchObject(
            { status: "expired" },
        );
        await expect(offers.check(hari, "short", NOW)).resolves.toMatchObject({
            status: "invalid",
        });
        expect(signups.findUnique).toHaveBeenCalledTimes(2);
    });

    it("writes a plan override for the offer's length and marks the entry joined", async () => {
        signups.findUnique!.mockResolvedValue(invited);
        (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
        signups.updateMany!.mockResolvedValue({ count: 1 });
        overrides.create!.mockResolvedValue({ id: "ov1" });

        await expect(offers.redeem(ctx, hari, token, NOW)).resolves.toEqual({
            planKey: "grow",
            until: new Date(NOW.getTime() + 37 * DAY_MS).toISOString(),
        });
        expect(signups.updateMany).toHaveBeenCalledWith({
            where: { id: "w1", joinedAt: null, inviteExpiresAt: { gt: NOW } },
            data: { joinedAt: NOW, joinedOrganizationId: "org1" },
        });
        expect(overrides.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org1",
                    kind: "plan",
                    key: "plan",
                    planKey: "grow",
                    expiresAt: new Date(NOW.getTime() + 37 * DAY_MS),
                    grantedByUserId: "u1",
                }),
            }),
        );
    });

    it("refuses another address with 403 and a taken token with 410", async () => {
        signups.findUnique!.mockResolvedValue(invited);
        await expect(
            offers.redeem(
                ctx,
                { ...hari, email: "someone@example.test" },
                token,
                NOW,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        signups.findUnique!.mockResolvedValue({
            ...invited,
            joinedAt: NOW,
            joinedOrganizationId: "org-other",
        });
        await expect(
            offers.redeem(ctx, hari, token, NOW),
        ).rejects.toBeInstanceOf(GoneException);
        expect(overrides.create).not.toHaveBeenCalled();
    });

    it("needs billing:manage on the business", async () => {
        await expect(
            offers.redeem({ ...ctx, role: "MEMBER" }, hari, token, NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(signups.findUnique).not.toHaveBeenCalled();
    });
});
