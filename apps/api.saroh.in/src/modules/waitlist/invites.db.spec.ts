/**
 * Opening-day invites and the launch offer (marketing plan U31) against a
 * real Postgres: staff send invites as a durable admin operation (dry run
 * first, one invite per entry, safe to re-run); signing up through an
 * invite puts the business on the offer plan for the offer's length and
 * marks the entry joined; a token is single use, bound to the entry's
 * email, and expires.
 *
 * The offer length here (37 days) is made up, as is every other value. The
 * email is a spy: nothing leaves the process (`email-launch-invite.spec.ts`
 * covers the sender's fake transport). Runs in the integration project.
 */
jest.mock("../../env", () => {
    const actual = jest.requireActual<typeof import("../../env")>("../../env");
    return {
        ...actual,
        env: {
            ...actual.env,
            ACCOUNTS_URL: "https://accounts.example.test",
            LAUNCH_OFFER_DAYS: 37,
        },
    };
});
jest.mock("../../common/email", () => ({
    sendWaitlistLaunchInviteEmail: jest.fn(),
}));

import {
    ConflictException,
    ForbiddenException,
    GoneException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendWaitlistLaunchInviteEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { env } from "../../env";
import type { AdminAuditService } from "../admin/admin-audit.service";
import { AdminOperationsService } from "../admin/admin-operations.service";
import { EntitlementService } from "../billing/entitlement.service";
import type { WebhooksService } from "../webhooks/webhooks.service";
import { hashInviteToken } from "./invite-token";
import { WaitlistInvitesService } from "./invites.service";
import { INVITE_REFUSALS, LaunchOfferService } from "./launch-offer.service";
import { WaitlistService } from "./waitlist.service";

const send = sendWaitlistLaunchInviteEmail as jest.Mock;
const tag = `${process.pid}-${Date.now()}`;
const DAY_MS = 24 * 60 * 60 * 1000;

const waitlist = new WaitlistService();
const invites = new WaitlistInvitesService();
const offers = new LaunchOfferService();
const audit = { write: jest.fn() };
const operations = new AdminOperationsService(
    audit as unknown as AdminAuditService,
    {} as WebhooksService,
    invites,
);
const staff: PlatformAdminInfo = {
    userId: "support_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions: [],
    viaBootstrap: false,
};

/** The operation's run, which `start` sets off without waiting for it. */
let running: Promise<void>[] = [];
const run = operations.run.bind(operations);
jest.spyOn(operations, "run").mockImplementation((id: string) => {
    const p = run(id);
    running.push(p);
    return p;
});

beforeEach(async () => {
    await prisma.waitlistSignup.deleteMany({});
    jest.clearAllMocks();
    running = [];
    send.mockResolvedValue("sent");
});

async function entry(email: string, business: string) {
    const result = await waitlist.join({ email, business, kind: "salon" });
    if (!result.created) throw new Error("expected a new entry");
    return prisma.waitlistSignup.findFirstOrThrow({
        where: { businessName: business },
    });
}

async function sendInvites(ids: string[], key = `key-${Math.random()}`) {
    const started = await operations.start({
        staff,
        kind: "waitlist.invite",
        targetIds: ids,
        reason: "Opening day",
        idempotencyKey: key,
    });
    await Promise.all(running);
    return operations.get(started.id);
}

/** The token in the link the spy was handed for this address. */
function tokenSentTo(email: string): string {
    const call = send.mock.calls.find(([to]) => to === email) as
        [string, { url: string }] | undefined;
    if (!call) throw new Error(`no invite sent to ${email}`);
    const token = new URL(call[1].url).searchParams.get("invite");
    if (!token) throw new Error("no token in the link");
    return token;
}

async function business(name: string) {
    return prisma.organization.create({
        data: {
            name,
            slug: `inv-${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
        },
    });
}

function owner(organizationId: string, userId: string): OrganizationContext {
    return { organizationId, userId, role: "OWNER" };
}

function user(email: string, id = `user-${email}`): AuthUser {
    return { id, email, emailVerified: true };
}

describe("sending invites (U31)", () => {
    it("dry-runs, then sends one invite per entry and keeps only the token's hash", async () => {
        const a = await entry(`asha-${tag}@example.test`, "Asha Salon");
        const b = await entry(`bina-${tag}@example.test`, "Bina Bakes");

        const plan = await operations.plan("waitlist.invite", [a.id, b.id]);
        expect(plan).toMatchObject({ act: 2, skip: 0, unsafe: 0 });
        expect(send).not.toHaveBeenCalled();

        const op = await sendInvites([a.id, b.id]);
        expect(op).toMatchObject({ status: "DONE", succeeded: 2, failed: 0 });
        expect(send).toHaveBeenCalledTimes(2);

        const token = tokenSentTo(a.email);
        const row = await prisma.waitlistSignup.findUniqueOrThrow({
            where: { id: a.id },
        });
        expect(row.invitedAt).not.toBeNull();
        expect(row.inviteSentAt).not.toBeNull();
        expect(row.inviteTokenHash).toBe(hashInviteToken(token));
        expect(row.inviteTokenHash).not.toBe(token);
        expect(row.inviteExpiresAt!.getTime()).toBeGreaterThan(Date.now());
        const [, details] = send.mock.calls[0] as [string, { url: string }];
        expect(details.url).toMatch(
            /^https:\/\/accounts\.example\.test\/signup\?invite=/,
        );
    });

    it("sends nobody a second invite when it runs again", async () => {
        const a = await entry(`chet-${tag}@example.test`, "Chet Gym");
        await sendInvites([a.id]);
        expect(send).toHaveBeenCalledTimes(1);

        const again = await sendInvites([a.id]);
        expect(again).toMatchObject({ succeeded: 0, skipped: 1 });
        expect(send).toHaveBeenCalledTimes(1);

        // The same idempotency key is the same operation, not a new one.
        const first = await sendInvites([a.id], "same-key-123");
        const replay = await sendInvites([a.id], "same-key-123");
        expect(replay.id).toBe(first.id);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("leaves a person waiting when their email does not leave", async () => {
        const a = await entry(`dev-${tag}@example.test`, "Dev Clinic");
        send.mockResolvedValue("failed");
        const op = await sendInvites([a.id]);
        expect(op).toMatchObject({ failed: 1, succeeded: 0 });
        const row = await prisma.waitlistSignup.findUniqueOrThrow({
            where: { id: a.id },
        });
        expect(row).toMatchObject({
            invitedAt: null,
            inviteTokenHash: null,
            inviteSentAt: null,
        });
    });

    it("sends again an invite whose send was interrupted, once its claim is stale", async () => {
        const a = await entry(`esha-${tag}@example.test`, "Esha Foods");
        await prisma.waitlistSignup.update({
            where: { id: a.id },
            data: { invitedAt: new Date(Date.now() - 60 * 60 * 1000) },
        });
        const plan = await operations.plan("waitlist.invite", [a.id]);
        expect(plan.items[0]).toMatchObject({ verdict: "act" });
        await sendInvites([a.id]);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("refuses every entry, saying why, while the offer isn't set", async () => {
        const a = await entry(`farah-${tag}@example.test`, "Farah Shop");
        const days = env.LAUNCH_OFFER_DAYS;
        env.LAUNCH_OFFER_DAYS = undefined;
        try {
            const plan = await operations.plan("waitlist.invite", [a.id]);
            expect(plan).toMatchObject({ act: 0, unsafe: 1 });
            expect(plan.items[0]?.detail).toContain("LAUNCH_OFFER_DAYS");
        } finally {
            env.LAUNCH_OFFER_DAYS = days;
        }
    });
});

describe("signing up through an invite (U31)", () => {
    async function invited(local: string, name: string) {
        const email = `${local}-${tag}@example.test`;
        const row = await entry(email, name);
        await sendInvites([row.id]);
        return { row, email, token: tokenSentTo(email) };
    }

    it("puts the new business on the offer plan for the offer's length and marks the entry joined", async () => {
        const { row, email, token } = await invited("gita", "Gita Studio");
        const me = user(email);
        await expect(offers.check(me, token)).resolves.toEqual({
            status: "ready",
            businessName: "Gita Studio",
            planKey: "grow",
            days: 37,
        });

        const org = await business("Gita Studio");
        const before = Date.now();
        const granted = await offers.redeem(owner(org.id, me.id), me, token);
        expect(granted.planKey).toBe("grow");
        const until = new Date(granted.until).getTime();
        expect(until - before).toBeGreaterThanOrEqual(37 * DAY_MS - 1000);
        expect(until - before).toBeLessThanOrEqual(37 * DAY_MS + 60_000);

        const live = await new EntitlementService().livePlanOverride(org.id);
        expect(live).toMatchObject({ planKey: "grow" });
        const joined = await prisma.waitlistSignup.findUniqueOrThrow({
            where: { id: row.id },
        });
        expect(joined.joinedAt).not.toBeNull();
        expect(joined.joinedOrganizationId).toBe(org.id);
        await expect(
            prisma.auditEvent.count({
                where: {
                    organizationId: org.id,
                    action: "organization.plan.launch_offer",
                },
            }),
        ).resolves.toBe(1);

        // A double submit answers the same and writes nothing more.
        await expect(
            offers.redeem(owner(org.id, me.id), me, token),
        ).resolves.toEqual(granted);
        await expect(
            prisma.entitlementOverride.count({
                where: { organizationId: org.id },
            }),
        ).resolves.toBe(1);
    });

    it("binds the token to the entry's email, compared the waitlist's way", async () => {
        const n = String(process.pid) + String(Date.now());
        const email = `H.ari.${n}+shop@Gmail.com`;
        const row = await entry(email, "Hari Store");
        await sendInvites([row.id]);
        const token = tokenSentTo(email.toLowerCase());

        const stranger = user(`someone-${tag}@example.test`);
        await expect(offers.check(stranger, token)).resolves.toMatchObject({
            status: "other-email",
        });
        const other = await business("Not Hari");
        await expect(
            offers.redeem(owner(other.id, stranger.id), stranger, token),
        ).rejects.toBeInstanceOf(ForbiddenException);

        // An account that has not confirmed its address can't use it either.
        const unconfirmed = {
            ...user(`hari${n}@gmail.com`),
            emailVerified: false,
        };
        await expect(offers.check(unconfirmed, token)).resolves.toMatchObject({
            status: "unverified",
        });

        // The same Gmail inbox, typed without the dots or the tag.
        const hari = user(`hari${n}@gmail.com`);
        const mine = await business("Hari Store");
        await expect(
            offers.redeem(owner(mine.id, hari.id), hari, token),
        ).resolves.toMatchObject({ planKey: "grow" });
    });

    it("is single use: a second business is refused with 'ask for a new invite'", async () => {
        const { email, token } = await invited("indu", "Indu Bakes");
        const me = user(email);
        const first = await business("Indu Bakes");
        await offers.redeem(owner(first.id, me.id), me, token);

        const second = await business("Indu Two");
        const refused = offers.redeem(owner(second.id, me.id), me, token);
        await expect(refused).rejects.toBeInstanceOf(GoneException);
        await expect(refused).rejects.toThrow(INVITE_REFUSALS.used);
        await expect(offers.check(me, token)).resolves.toMatchObject({
            status: "used",
        });
    });

    it("refuses an expired token and an unknown one", async () => {
        const { row, email, token } = await invited("jai", "Jai Coach");
        await prisma.waitlistSignup.update({
            where: { id: row.id },
            data: { inviteExpiresAt: new Date(Date.now() - 1000) },
        });
        const me = user(email);
        const org = await business("Jai Coach");
        const expired = offers.redeem(owner(org.id, me.id), me, token);
        await expect(expired).rejects.toBeInstanceOf(GoneException);
        await expect(expired).rejects.toThrow(INVITE_REFUSALS.expired);

        const unknown = "A".repeat(43);
        await expect(
            offers.redeem(owner(org.id, me.id), me, unknown),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(offers.check(me, "not-a-token")).resolves.toMatchObject({
            status: "invalid",
        });
        const untouched = await prisma.waitlistSignup.findUniqueOrThrow({
            where: { id: row.id },
        });
        expect(untouched.joinedAt).toBeNull();
    });

    it("never replaces a plan the business already pays for", async () => {
        const { email, token } = await invited("kiran", "Kiran Studio");
        const me = user(email);
        const org = await business("Kiran Studio");
        const plan = await prisma.plan.create({
            data: {
                key: `catalog.pro-${tag}`,
                version: 1,
                name: "Made-up paid plan",
                priceCents: 11_100,
                entitlements: {},
            },
        });
        await prisma.subscription.create({
            data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
        });
        await expect(
            offers.redeem(owner(org.id, me.id), me, token),
        ).rejects.toBeInstanceOf(ConflictException);
        const row = await prisma.waitlistSignup.findFirstOrThrow({
            where: { email },
        });
        expect(row.joinedAt).toBeNull();
    });
});
