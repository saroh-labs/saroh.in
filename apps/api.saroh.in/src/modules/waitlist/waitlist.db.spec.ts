/**
 * The waitlist (marketing plan U30) against a real Postgres: places come
 * from the sequence, one entry per normalised email and business, a repeat
 * learns nothing, a referral is credited once and never to oneself, the
 * console reads kinds, cities, sources and top referrers, a removal and the
 * retention sweep delete what they should, and nothing is emailed.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/email", () => ({
    sendWaitlistLaunchInviteEmail: jest.fn(),
}));

import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendWaitlistLaunchInviteEmail } from "../../common/email";
import type { AdminAuditService } from "../admin/admin-audit.service";
import { AdminWaitlistService } from "../admin/admin-waitlist.service";
import { WaitlistInvitesService } from "./invites.service";
import { WaitlistRetentionHandler } from "./waitlist-retention.handler";
import { WaitlistService } from "./waitlist.service";

const tag = `${process.pid}-${Date.now()}`;
const mail = (who: string) => `${who}-${tag}@example.test`;
const DAY_MS = 24 * 60 * 60 * 1000;

const service = new WaitlistService();
const audit = { write: jest.fn() };
const admin = new AdminWaitlistService(
    audit as unknown as AdminAuditService,
    new WaitlistInvitesService(),
);
const staff: PlatformAdminInfo = {
    userId: "support_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions: [],
    viaBootstrap: false,
};

beforeEach(async () => {
    await prisma.waitlistSignup.deleteMany({});
    jest.clearAllMocks();
});

async function joined(input: Parameters<WaitlistService["join"]>[0]) {
    const result = await service.join(input);
    if (!result.created) throw new Error("expected a new entry");
    return result;
}

describe("joining", () => {
    it("gives each new entry the next place and its own referral id", async () => {
        const first = await joined({
            email: mail("one"),
            business: "Glow Studio",
            kind: "salon",
            city: "Pune",
        });
        const second = await joined({
            email: mail("two"),
            business: "Iron House",
            kind: "gym",
        });

        expect(second.position).toBe(first.position + 1);
        expect(first.refCode).toMatch(/^[a-z2-9]{8}$/);
        expect(second.refCode).not.toBe(first.refCode);
    });

    it("keeps the gallery template a visitor saved, and only one it knows (U13)", async () => {
        await joined({
            email: mail("tpl"),
            business: "Iron & Oak",
            kind: "gym",
            template: "gym",
        });
        await joined({
            email: mail("tpl-unknown"),
            business: "Kesar Salon",
            kind: "salon",
            template: "no-such-template",
        });
        const rows = await prisma.waitlistSignup.findMany({
            where: { email: { in: [mail("tpl"), mail("tpl-unknown")] } },
            select: { email: true, template: true },
            orderBy: { position: "asc" },
        });
        expect(rows).toEqual([
            { email: mail("tpl"), template: "gym" },
            { email: mail("tpl-unknown"), template: null },
        ]);
    });

    it("treats A.B+x@gmail.com as ab@gmail.com: a repeat, no place, no new row", async () => {
        const address = `ab${process.pid}@gmail.com`;
        await joined({
            email: address,
            business: "Glow Studio",
            kind: "salon",
        });

        const again = await service.join({
            email: address.replace(/^ab/, "A.B").replace("@", "+x@"),
            business: "  glow   STUDIO ",
            kind: "salon",
        });

        expect(again).toEqual({ created: false });
        expect(
            await prisma.waitlistSignup.count({
                where: { emailKey: address },
            }),
        ).toBe(1);
    });

    it("lets one owner list a second business", async () => {
        await joined({
            email: mail("owner"),
            business: "Glow Studio",
            kind: "salon",
        });
        const other = await service.join({
            email: mail("owner"),
            business: "Glow Studio Baner",
            kind: "salon",
        });

        expect(other.created).toBe(true);
    });

    it("stores the page's source, or direct, and the plan a button named", async () => {
        await joined({
            email: mail("insta"),
            business: "A",
            kind: "shop",
            source: "instagram",
            plan: "grow",
        });
        await joined({ email: mail("plain"), business: "B", kind: "shop" });

        const rows = await prisma.waitlistSignup.findMany({
            select: { email: true, source: true, plan: true },
            orderBy: { position: "asc" },
        });
        expect(rows).toEqual([
            { email: mail("insta"), source: "instagram", plan: "grow" },
            { email: mail("plain"), source: "direct", plan: null },
        ]);
    });

    it("still takes the V1 form's email-only signup, once", async () => {
        await joined({ email: mail("v1"), source: "saroh.in" });
        expect(await service.join({ email: mail("v1") })).toEqual({
            created: false,
        });
    });

    it("emails nobody", async () => {
        await joined({ email: mail("quiet"), business: "Q", kind: "other" });
        expect(sendWaitlistLaunchInviteEmail).not.toHaveBeenCalled();
    });
});

describe("referrals", () => {
    it("credits the link's owner once per new entry, never a self-referral", async () => {
        const owner = await joined({
            email: mail("ref-owner"),
            business: "Owner Co",
            kind: "clinic",
            ipHash: "hash-owner",
        });

        await joined({
            email: mail("friend"),
            business: "Friend Co",
            kind: "clinic",
            ref: owner.refCode!,
            ipHash: "hash-friend",
        });
        // The same friend again: a repeat, so no second credit.
        await service.join({
            email: mail("friend"),
            business: "Friend Co",
            kind: "clinic",
            ref: owner.refCode!,
            ipHash: "hash-friend",
        });
        // The owner's own second business, and someone on the owner's network.
        await joined({
            email: mail("ref-owner"),
            business: "Owner Co Two",
            kind: "clinic",
            ref: owner.refCode!,
            ipHash: "hash-elsewhere",
        });
        await joined({
            email: mail("housemate"),
            business: "Housemate Co",
            kind: "clinic",
            ref: owner.refCode!,
            ipHash: "hash-owner",
        });

        const ownerRow = await prisma.waitlistSignup.findUniqueOrThrow({
            where: { refCode: owner.refCode! },
            select: { _count: { select: { referrals: true } } },
        });
        expect(ownerRow._count.referrals).toBe(1);

        const summary = await admin.summary();
        expect(summary.topReferrers).toEqual([
            expect.objectContaining({
                businessName: "Owner Co",
                referrals: 1,
            }),
        ]);
    });
});

describe("the console's read", () => {
    beforeEach(async () => {
        await joined({
            email: mail("a"),
            business: "A",
            kind: "salon",
            city: "Pune",
            country: "IN",
        });
        await joined({
            email: mail("b"),
            business: "B",
            kind: "salon",
            city: "pune",
            country: "IN",
        });
        await joined({
            email: mail("c"),
            business: "C",
            kind: "gym",
            city: "Indore",
            country: "US",
        });
        await joined({
            email: mail("d"),
            business: "D",
            kind: "gym",
            source: "instagram",
        });
    });

    it("counts by kind, city (whatever the case) and source", async () => {
        const summary = await admin.summary();

        expect(summary.waiting).toBe(4);
        expect(summary.byKind).toEqual(
            expect.arrayContaining([
                { kind: "salon", count: 2 },
                { kind: "gym", count: 2 },
            ]),
        );
        expect(summary.byCity).toEqual([
            { city: "Pune", count: 2 },
            { city: "Indore", count: 1 },
        ]);
        expect(summary.bySource).toEqual(
            expect.arrayContaining([
                { source: "direct", count: 3 },
                { source: "instagram", count: 1 },
            ]),
        );
        // Country as the site's host saw it; none for an entry without.
        expect(summary.byCountry).toEqual([
            { country: "IN", count: 2 },
            { country: "US", count: 1 },
            { country: null, count: 1 },
        ]);
    });

    it("filters by country, and by none", async () => {
        const us = await admin.list({ country: "us" });
        expect(us.items.map((r) => [r.businessName, r.country])).toEqual([
            ["C", "US"],
        ]);
        const none = await admin.list({ country: "none" });
        expect(none.items.map((r) => r.businessName)).toEqual(["D"]);
    });

    it("lists entries with their kind and city, filtered by either", async () => {
        const salons = await admin.list({ kind: "salon" });
        expect(salons.items.map((row) => row.businessName)).toEqual(["A", "B"]);
        expect(salons.items[0]).toEqual(
            expect.objectContaining({
                kind: "salon",
                city: "Pune",
                referrals: 0,
                position: expect.any(Number),
            }),
        );

        const pune = await admin.list({ city: "PUNE" });
        expect(pune.items.map((row) => row.businessName)).toEqual(["A", "B"]);
    });

    it("removes an entry on request, and audits it without the address", async () => {
        const [first] = (await admin.list({})).items;
        await admin.remove(staff, first!.id, "Asked by email");

        expect(await prisma.waitlistSignup.count()).toBe(3);
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "waitlist.removed",
                targetId: first!.id,
            }),
        );
        expect(
            JSON.stringify(audit.write.mock.calls.map((call) => call[1])),
        ).not.toContain(first!.email);
        await expect(
            admin.remove(staff, first!.id, "Asked by email"),
        ).rejects.toThrow("Not on the waitlist");
    });
});

describe("retention", () => {
    it("deletes an entry invited over 12 months ago that never joined, and nothing else", async () => {
        const now = new Date();
        const old = new Date(now.getTime() - 400 * DAY_MS);
        await joined({ email: mail("stale"), business: "S", kind: "shop" });
        await joined({ email: mail("came"), business: "C", kind: "shop" });
        await joined({ email: mail("recent"), business: "R", kind: "shop" });
        await joined({ email: mail("waiting"), business: "W", kind: "shop" });
        await prisma.waitlistSignup.updateMany({
            where: { email: { in: [mail("stale"), mail("came")] } },
            data: { invitedAt: old },
        });
        await prisma.waitlistSignup.updateMany({
            where: { email: mail("came") },
            data: { joinedAt: old },
        });
        await prisma.waitlistSignup.updateMany({
            where: { email: mail("recent") },
            data: { invitedAt: new Date(now.getTime() - 30 * DAY_MS) },
        });

        await expect(new WaitlistRetentionHandler().sweep(now)).resolves.toBe(
            1,
        );

        const left = await prisma.waitlistSignup.findMany({
            select: { email: true },
            orderBy: { position: "asc" },
        });
        expect(left.map((row) => row.email)).toEqual([
            mail("came"),
            mail("recent"),
            mail("waiting"),
        ]);
    });
});

describe("the link preview tool's entries (resources plan U2)", () => {
    it("drops a report-only entry 12 months after its check, and only the link from any other", async () => {
        const now = new Date();
        const old = new Date(now.getTime() - 400 * DAY_MS);
        const recent = new Date(now.getTime() - 30 * DAY_MS);
        const report = (who: string, at: Date) =>
            prisma.waitlistSignup.create({
                data: {
                    email: mail(who),
                    emailKey: mail(who),
                    source: "link-preview",
                    checkedUrl: "https://example-bakery.in/",
                    checkedAt: at,
                    newsConsent: false,
                },
            });
        await report("old-report", old);
        await report("new-report", recent);
        await joined({ email: mail("owner"), business: "O", kind: "shop" });
        await prisma.waitlistSignup.updateMany({
            where: { email: mail("owner") },
            data: { checkedUrl: "https://owner.example.com/", checkedAt: old },
        });

        await expect(new WaitlistRetentionHandler().sweep(now)).resolves.toBe(
            1,
        );

        const left = await prisma.waitlistSignup.findMany({
            select: { email: true, checkedUrl: true, checkedAt: true },
            orderBy: { position: "asc" },
        });
        expect(left).toEqual([
            {
                email: mail("new-report"),
                checkedUrl: "https://example-bakery.in/",
                checkedAt: recent,
            },
            { email: mail("owner"), checkedUrl: null, checkedAt: null },
        ]);
    });

    it("drops a QR code maker entry 12 months after its last use (QR codes plan U9)", async () => {
        const now = new Date();
        const used = (who: string, at: Date) =>
            prisma.waitlistSignup.create({
                data: {
                    email: mail(who),
                    emailKey: mail(who),
                    source: "qr-maker",
                    checkedAt: at,
                    newsConsent: false,
                },
            });
        await used("old-qr", new Date(now.getTime() - 400 * DAY_MS));
        await used("new-qr", new Date(now.getTime() - 30 * DAY_MS));

        await expect(new WaitlistRetentionHandler().sweep(now)).resolves.toBe(
            1,
        );
        const left = await prisma.waitlistSignup.findMany({
            select: { email: true },
        });
        expect(left).toEqual([{ email: mail("new-qr") }]);
    });
});
