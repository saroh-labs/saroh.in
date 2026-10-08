/**
 * A plan that ends on a date (#805) against a real Postgres: the billing
 * sweep tells the business 30, 7 and 1 days before a `plan` override ends
 * (the launch offer's mechanism) — an inbox notice and an email to its
 * billing people — once per override, end and stage. An end that costs
 * nothing (a business that has since paid for a plan as good), one taken
 * away, or one moved is not told; the app's countdown reads the same end.
 *
 * Every catalogue here is made up (`fakeCatalog`: Plan A free, Plan B 222,
 * Plan C 333). Runs in the integration project (TEST_DATABASE_URL).
 */
const createTransport = jest.fn();
jest.mock("nodemailer", () => ({
    __esModule: true,
    default: { createTransport },
}));

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { SarohBillingEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BILLING_EMAIL_TYPE, BillingEmailHandler } from "./billing-email.job";
import { CatalogueAccessService } from "./catalogue-access.service";
import { MovesApplyHandler } from "./moves-apply.handler";
import {
    PLAN_ENDING_NOTICE_KIND,
    PLAN_ENDING_NOTIFICATION_TYPE,
} from "./plan-ending";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

const access = new CatalogueAccessService();
const sweep = new MovesApplyHandler(access);
let sent: SarohBillingEmail[];
let mailer: BillingEmailHandler;

beforeEach(async () => {
    sent = [];
    mailer = new BillingEmailHandler((email) => {
        sent.push(email);
        return Promise.resolve("sent");
    });
    await prisma.job.deleteMany({});
    // Earlier tests' plans end too: take them away, so each test's sweep
    // reads only its own businesses.
    await prisma.entitlementOverride.updateMany({
        where: { organization: { slug: { endsWith: tag } }, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    const catalog = fakeCatalog();
    await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, 1),
    });
});

afterEach(() => {
    // Nothing in this file ever reaches a real mail transport.
    expect(createTransport).not.toHaveBeenCalled();
});

let seq = 0;
async function business(): Promise<
    OrganizationContext & { ownerEmail: string }
> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Ending ${seq}`, slug: `ending-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const owner = await prisma.user.create({
        data: { email: `owner-${seq}-${tag}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    return {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        ownerEmail: owner.email,
    };
}

async function planFor(
    organizationId: string,
    planKey: string,
    expiresAt: Date | null,
) {
    return prisma.entitlementOverride.create({
        data: {
            organizationId,
            kind: "plan",
            key: "plan",
            planKey,
            reason: "Launch offer: joined from a waitlist invite.",
            grantedByUserId: "test-user",
            expiresAt,
        },
    });
}

async function notices(organizationId: string) {
    return prisma.notification.findMany({
        where: { organizationId, type: PLAN_ENDING_NOTIFICATION_TYPE },
        orderBy: { createdAt: "asc" },
    });
}

/** Run every waiting billing email, as the worker would. */
async function runMail() {
    const jobs = await prisma.job.findMany({
        where: { type: BILLING_EMAIL_TYPE, status: "PENDING" },
    });
    for (const j of jobs) {
        await mailer.handle(j as Job);
        await prisma.job.update({
            where: { id: j.id },
            data: { status: "COMPLETED" },
        });
    }
    return jobs;
}

describe("a plan that ends on a date", () => {
    it("is told 30, 7 and 1 days ahead, in the inbox and by email, once each", async () => {
        const ctx = await business();
        const now = new Date();
        const ends = new Date(now.getTime() + 20 * DAY);
        const offer = await planFor(ctx.organizationId, "c", ends);

        // 20 days out: the 30-day notice.
        expect(await sweep.remindEndingPlans(now)).toBe(1);
        const [first] = await notices(ctx.organizationId);
        expect(first?.title).toMatch(/^Your Plan C plan ends on /);
        expect(first?.body).toContain("moves to the Plan A plan");
        const jobs = await runMail();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.payload).toMatchObject({
            kind: "PLAN_ENDING",
            overrideId: offer.id,
            endsAt: ends.toISOString(),
            stage: 30,
        });
        expect(sent).toHaveLength(1);
        expect(sent[0]!.to).toEqual([ctx.ownerEmail]);
        expect(sent[0]!.subject).toMatch(/^Ending \d+'s Plan C plan ends on /);
        expect(sent[0]!.html).toContain("moves to the Plan A plan");

        // The next hour's sweep, and a redelivered email: nothing more.
        expect(
            await sweep.remindEndingPlans(new Date(now.getTime() + 3600_000)),
        ).toBe(0);
        await mailer.handle(jobs[0] as Job);
        expect(sent).toHaveLength(1);

        // Six days out: the 7-day notice. Twelve hours out: the 1-day one.
        expect(
            await sweep.remindEndingPlans(new Date(ends.getTime() - 6 * DAY)),
        ).toBe(1);
        expect(
            await sweep.remindEndingPlans(
                new Date(ends.getTime() - 12 * 3600_000),
            ),
        ).toBe(1);
        await runMail();
        expect(sent).toHaveLength(3);
        expect(await notices(ctx.organizationId)).toHaveLength(3);
        const claims = await prisma.customerNotice.findMany({
            where: {
                organizationId: ctx.organizationId,
                kind: PLAN_ENDING_NOTICE_KIND,
            },
        });
        expect(claims.map((c) => c.eventKey.split(":").pop()).sort()).toEqual([
            "1",
            "30",
            "7",
        ]);
        expect(claims.every((c) => c.notificationId)).toBe(true);

        // Past its end: nothing.
        expect(
            await sweep.remindEndingPlans(new Date(ends.getTime() + DAY)),
        ).toBe(0);
    });

    it("a plan given for ten days is told at once, then 7 and 1 days ahead", async () => {
        const ctx = await business();
        const now = new Date();
        const ends = new Date(now.getTime() + 10 * DAY);
        await planFor(ctx.organizationId, "c", ends);
        await sweep.remindEndingPlans(now);
        await sweep.remindEndingPlans(new Date(now.getTime() + DAY));
        await sweep.remindEndingPlans(new Date(ends.getTime() - 4 * DAY));
        const jobs = await runMail();
        expect(jobs.map((j) => (j.payload as { stage: number }).stage)).toEqual(
            [30, 7],
        );
    });

    it("says nothing when the end costs nothing, is taken away, or never comes", async () => {
        const now = new Date();
        // Paid for Plan C since: the offer's end changes nothing.
        const paid = await business();
        const c = await prisma.plan.findUniqueOrThrow({
            where: {
                key_version_interval: {
                    key: "catalog.c",
                    version: 1,
                    interval: "month",
                },
            },
        });
        await prisma.subscription.update({
            where: { organizationId: paid.organizationId },
            data: { planId: c.id, status: "ACTIVE" },
        });
        await planFor(
            paid.organizationId,
            "c",
            new Date(now.getTime() + 5 * DAY),
        );
        // Taken away.
        const revoked = await business();
        const gone = await planFor(
            revoked.organizationId,
            "c",
            new Date(now.getTime() + 5 * DAY),
        );
        await prisma.entitlementOverride.update({
            where: { id: gone.id },
            data: { revokedAt: now },
        });
        // No end.
        const forever = await business();
        await planFor(forever.organizationId, "c", null);
        // Further off than 30 days.
        const later = await business();
        await planFor(
            later.organizationId,
            "c",
            new Date(now.getTime() + 45 * DAY),
        );

        expect(await sweep.remindEndingPlans(now)).toBe(0);
        for (const b of [paid, revoked, forever, later]) {
            expect(await notices(b.organizationId)).toHaveLength(0);
        }
        expect(await access.planEnding(paid.organizationId, now)).toBeNull();
    });

    it("an end moved later is told again under its new end; the old one's email says nothing", async () => {
        const ctx = await business();
        const now = new Date();
        await planFor(
            ctx.organizationId,
            "c",
            new Date(now.getTime() + 5 * DAY),
        );
        expect(await sweep.remindEndingPlans(now)).toBe(1);
        const [stale] = await prisma.job.findMany({
            where: { type: BILLING_EMAIL_TYPE },
        });
        // Saroh extends the offer: a newer override with a later end.
        const ends = new Date(now.getTime() + 25 * DAY);
        const extended = await planFor(ctx.organizationId, "c", ends);
        await mailer.handle(stale as Job);
        expect(sent).toHaveLength(0);

        expect(await sweep.remindEndingPlans(now)).toBe(1);
        const jobs = await prisma.job.findMany({
            where: { type: BILLING_EMAIL_TYPE },
            orderBy: { createdAt: "asc" },
        });
        expect(jobs[1]!.payload).toMatchObject({
            overrideId: extended.id,
            endsAt: ends.toISOString(),
            stage: 30,
        });
    });

    it("the old email says nothing once the override is taken away", async () => {
        const ctx = await business();
        const now = new Date();
        const offer = await planFor(
            ctx.organizationId,
            "c",
            new Date(now.getTime() + 5 * DAY),
        );
        expect(await sweep.remindEndingPlans(now)).toBe(1);
        await prisma.entitlementOverride.update({
            where: { id: offer.id },
            data: { revokedAt: now },
        });
        await runMail();
        expect(sent).toHaveLength(0);
    });

    it("the app's countdown reads the end within 30 days, and nothing further off", async () => {
        const soon = await business();
        const now = new Date();
        const ends = new Date(now.getTime() + 9 * DAY);
        await planFor(soon.organizationId, "b", ends);
        expect((await access.view(soon)).planEnding).toEqual({
            planName: "Plan B",
            endsAt: ends.toISOString(),
            nextPlanName: "Plan A",
        });

        const far = await business();
        await planFor(
            far.organizationId,
            "b",
            new Date(now.getTime() + 40 * DAY),
        );
        expect((await access.view(far)).planEnding).toBeNull();
    });
});
