/**
 * Moving to a lower plan (#800, #801) against a real Postgres: the billing
 * sweep tells the business what will pause, and nothing pauses until 7
 * days after that notice; moving back up restores everything at once.
 *
 * - A plan given until a date (#805), told 7 days ahead, pauses on its
 *   end: the team member who joined last and the oldest product.
 * - A business already over its limits (a move that happened at once) is
 *   told within the hour and pauses 7 days later, not before.
 * - Moving back up un-pauses everything with nothing written.
 *
 * Every catalogue here is made up (`fakeCatalog`). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
const createTransport = jest.fn();
jest.mock("nodemailer", () => ({
    __esModule: true,
    default: { createTransport },
}));

import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { CatalogueAccessService } from "./catalogue-access.service";
import { MovesApplyHandler } from "./moves-apply.handler";
import { MOVE_DOWN_CLAIM_KIND } from "./over-limit";
import { OverLimitService } from "./over-limit.service";
import { PLAN_ENDING_NOTIFICATION_TYPE } from "./plan-ending";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const access = new CatalogueAccessService(flags);
const svc = new OverLimitService(access, flags);
const sweep = new MovesApplyHandler(access, svc);

beforeEach(async () => {
    svc.forget();
    await prisma.job.deleteMany({});
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
    expect(createTransport).not.toHaveBeenCalled();
});

let seq = 0;

/**
 * A business on Free with an owner and two team members who joined after
 * it, and one product more than Free includes.
 */
async function business(products: number) {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Down ${seq}`, slug: `down-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const people = [];
    for (const [i, role] of ["OWNER", "ADMIN", "ADMIN"].entries()) {
        const user = await prisma.user.create({
            data: {
                email: `p${i}-${seq}-${tag}@example.test`,
                name: `Person ${i} ${seq}`,
            },
        });
        people.push(
            await prisma.membership.create({
                data: {
                    organizationId: org.id,
                    userId: user.id,
                    role,
                    createdAt: new Date(Date.now() - (30 - i) * DAY),
                },
            }),
        );
    }
    for (let i = 0; i < products; i += 1) {
        await prisma.product.create({
            data: {
                organizationId: org.id,
                name: `Thing ${i}`,
                slug: `thing-${i}-${seq}`,
                price: 1,
                createdAt: new Date(Date.now() - (100 - i) * DAY),
            },
        });
    }
    return { org, people };
}

async function planUntil(
    organizationId: string,
    planKey: string,
    end: Date | null,
) {
    return prisma.entitlementOverride.create({
        data: {
            organizationId,
            kind: "plan",
            key: "plan",
            planKey,
            reason: "Test plan.",
            grantedByUserId: "test-user",
            expiresAt: end,
        },
    });
}

describe("moving to a lower plan (#800, #801)", () => {
    it("a plan that ends, told 7 days ahead, pauses on its end, and moving back up restores it", async () => {
        const now = new Date();
        const end = new Date(now.getTime() + 7 * DAY - 60_000);
        const { org, people } = await business(12);
        await planUntil(org.id, "c", end);

        // On plan C nothing is over: nothing pauses.
        expect(await svc.pausedNow(org.id, now)).toBeNull();

        await sweep.sweep(now);
        const told = await prisma.notification.findMany({
            where: {
                organizationId: org.id,
                type: PLAN_ENDING_NOTIFICATION_TYPE,
            },
        });
        expect(told).toHaveLength(1);
        expect(told[0].body).toContain("becomes read-only");
        expect(told[0].body).toContain(
            `Person 1 ${seq} and Person 2 ${seq} are paused`,
        );
        expect(told[0].body).toContain(
            "1 product, your oldest, is hidden from your site",
        );
        expect(
            await prisma.customerNotice.count({
                where: { organizationId: org.id, kind: MOVE_DOWN_CLAIM_KIND },
            }),
        ).toBe(1);

        // Its end: the owner stays, the two who joined after are paused,
        // and the oldest product is hidden.
        svc.forget();
        const after = new Date(end.getTime() + 60_000);
        const paused = await svc.pausedNow(org.id, after);
        expect(paused).not.toBeNull();
        expect([...(paused?.memberIds ?? [])].sort()).toEqual(
            [people[1].id, people[2].id].sort(),
        );
        expect(paused?.products).not.toBeNull();

        // Invoices, orders and customers: untouched (none written or read).
        // Moving back up: everything at once, nothing to undo.
        await planUntil(org.id, "c", null);
        svc.forget();
        expect(await svc.pausedNow(org.id, after)).toBeNull();
    });

    it("a move that already happened is told within the hour and pauses 7 days later", async () => {
        const now = new Date();
        const { org } = await business(12);

        await sweep.sweep(now);
        const told = await prisma.notification.findMany({
            where: {
                organizationId: org.id,
                type: PLAN_ENDING_NOTIFICATION_TYPE,
            },
        });
        expect(told.map((n) => n.title)).toEqual([
            expect.stringMatching(/^Some things pause on /),
        ]);
        expect(
            await prisma.job.count({
                where: { type: "billing.email", organizationId: org.id },
            }),
        ).toBe(1);

        svc.forget();
        expect(
            await svc.pausedNow(org.id, new Date(now.getTime() + 6 * DAY)),
        ).toBeNull();
        svc.forget();
        expect(
            await svc.pausedNow(
                org.id,
                new Date(now.getTime() + 7 * DAY + 60_000),
            ),
        ).not.toBeNull();

        // A second sweep says nothing more.
        await sweep.sweep(new Date(now.getTime() + 60 * 60 * 1000));
        expect(
            await prisma.notification.count({
                where: {
                    organizationId: org.id,
                    type: PLAN_ENDING_NOTIFICATION_TYPE,
                },
            }),
        ).toBe(1);
    });
});
