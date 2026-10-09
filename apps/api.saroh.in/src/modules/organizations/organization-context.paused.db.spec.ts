/**
 * A team member past the plan's limit after a move to a lower plan (#800),
 * against a real Postgres: the owner and the earliest to join open the
 * business, the latest is refused with MEMBER_PAUSED once the business was
 * told at least 7 days ago, not before, and moving back up lets them in at
 * once. With `PLAN_ENFORCEMENT` off nobody is refused.
 *
 * Catalogue numbers are made up (`fakeMeteredCatalog`: the first plan
 * seats two). Runs in the integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import { MOVE_DOWN_CLAIM_KIND, moveDownClaimKey } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { MEMBER_PAUSED } from "../billing/paused-errors";
import { FlagKey } from "../feature-flags/flags";
import { OrganizationContextService } from "./organization-context.service";

const tag = `${process.pid}-${Date.now()}`;
const V = 830_000 + Math.floor(Math.random() * 9_000);
const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

const contexts = new OrganizationContextService();

async function planRow(planId: string) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
}

/** A business on Free@V with an owner and three admins, joined in order. */
async function business(enforce = true) {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye") },
    });
    const people: { userId: string; membershipId: string }[] = [];
    const roles = ["OWNER", "ADMIN", "ADMIN", "ADMIN"];
    for (let i = 0; i < roles.length; i++) {
        const user = await prisma.user.create({
            data: { email: `${uniq("p")}@example.com`, name: `Person ${i}` },
        });
        const m = await prisma.membership.create({
            data: {
                organizationId: org.id,
                userId: user.id,
                role: roles[i],
                createdAt: new Date(Date.now() - (10 - i) * DAY),
            },
        });
        people.push({ userId: user.id, membershipId: m.id });
    }
    const sub = await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: (await planRow("free")).id,
            status: "ACTIVE",
        },
    });
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.PLAN_ENFORCEMENT,
            organizationId: org.id,
            enabled: enforce,
        },
    });
    return { orgId: org.id, subId: sub.id, people };
}

/** The business was told what would pause, `daysAgo` days ago. */
async function told(orgId: string, daysAgo: number) {
    const limits = await overLimit.limitsNow(orgId);
    expect(limits).not.toBeNull();
    await prisma.customerNotice.create({
        data: {
            organizationId: orgId,
            eventKey: moveDownClaimKey(limits!),
            kind: MOVE_DOWN_CLAIM_KIND,
            createdAt: new Date(Date.now() - daysAgo * DAY),
        },
    });
    overLimit.forget(orgId);
}

beforeAll(async () => {
    const catalog = fakeMeteredCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("opening a business past its team limit (DB, #800)", () => {
    it("lets the owner and the earliest in, and refuses the latest", async () => {
        const b = await business();
        await told(b.orgId, 8);
        const [owner, first, second, third] = b.people;

        await expect(
            contexts.resolve(owner.userId, b.orgId),
        ).resolves.toMatchObject({ role: "OWNER" });
        await expect(
            contexts.resolve(first.userId, b.orgId),
        ).resolves.toMatchObject({ role: "ADMIN" });
        for (const late of [second, third]) {
            const err = await contexts
                .resolve(late.userId, b.orgId)
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(ForbiddenException);
            expect((err as ForbiddenException).getResponse()).toMatchObject({
                message: expect.stringMatching(
                    /^Your access to Rye Bakery is paused/,
                ),
                details: { code: MEMBER_PAUSED },
            });
        }

        // The chooser says so rather than opening into the refusal.
        const list = await contexts.listForUser(third.userId);
        expect(list).toEqual([
            expect.objectContaining({ id: b.orgId, paused: true }),
        ]);
    });

    it("refuses nobody until 7 days after the business was told", async () => {
        const b = await business();
        await told(b.orgId, 6);
        await expect(
            contexts.resolve(b.people[3].userId, b.orgId),
        ).resolves.toMatchObject({ role: "ADMIN" });
    });

    it("lets everyone in again the moment the business moves up", async () => {
        const b = await business();
        await told(b.orgId, 8);
        const late = b.people[3];
        await expect(contexts.resolve(late.userId, b.orgId)).rejects.toThrow(
            ForbiddenException,
        );

        await prisma.subscription.update({
            where: { id: b.subId },
            data: { planId: (await planRow("pro")).id },
        });
        overLimit.forget(b.orgId);
        await expect(
            contexts.resolve(late.userId, b.orgId),
        ).resolves.toMatchObject({ role: "ADMIN" });
    });

    it("refuses nobody with plan enforcement off", async () => {
        const b = await business(false);
        await prisma.customerNotice.create({
            data: {
                organizationId: b.orgId,
                eventKey: "move-down:whatever",
                kind: MOVE_DOWN_CLAIM_KIND,
                createdAt: new Date(Date.now() - 30 * DAY),
            },
        });
        overLimit.forget(b.orgId);
        await expect(
            contexts.resolve(b.people[3].userId, b.orgId),
        ).resolves.toMatchObject({ role: "ADMIN" });
    });
});
