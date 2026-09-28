/**
 * The readers that refuse a DRAFT plan (round-2 D21, the reader half of plan
 * 004's D5), against a real Postgres. Nothing can create a draft yet, so a
 * test marks a plan DRAFT directly — what D5's writers will do. Each path
 * that sells or lists a plan for sale must refuse or hide it, and ACTIVE and
 * ARCHIVED plans must behave as they did. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { PLAN_NOT_PUBLISHED, PLANS_ON_SALE } from "./plan-on-sale";
import { planViews } from "./plans";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());

let shop: OrganizationContext;
let draftId: string;
let activeId: string;
let archivedId: string;

let people = 0;
async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: shop.organizationId,
                email: `draft-reader-${people}@example.com`,
            },
        })
    ).id;
}

async function plan(name: string, price = "1200"): Promise<string> {
    return (
        await service.createPlan(shop, {
            name,
            price,
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
}

/** What D5's writers will do: a plan that isn't published yet. */
async function markDraft(id: string): Promise<void> {
    await prisma.subscriptionPlan.update({
        where: { id },
        data: { status: "DRAFT" },
    });
}

const statusOf = async (id: string) =>
    (await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Drafts", slug: `d21-drafts-${process.pid}` },
    });
    shop = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    activeId = await plan("Monthly");
    archivedId = await plan("Old monthly", "900");
    await service.setPlanStatus(shop, archivedId, "ARCHIVED");
    draftId = await plan("Unlimited", "2500");
    await markDraft(draftId);
});

describe("a DRAFT plan is never sold (D21, real database)", () => {
    it("staff subscribe to a draft → 409, and nothing is made", async () => {
        const contactId = await person();
        const attempt = service.subscribe(shop, { contactId, planId: draftId });
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(
            service.subscribe(shop, { contactId, planId: draftId }),
        ).rejects.toThrow(PLAN_NOT_PUBLISHED);

        expect(
            await prisma.customerSubscription.count({
                where: { planId: draftId },
            }),
        ).toBe(0);
        expect(
            await prisma.invoice.count({
                where: { organizationId: shop.organizationId, contactId },
            }),
        ).toBe(0);
    });

    it("switching a subscription onto a draft → 409, and no switch waits", async () => {
        const s = await service.subscribe(shop, {
            contactId: await person(),
            planId: activeId,
        });
        await expect(
            service.changePlan(shop, s.id, { planId: draftId }),
        ).rejects.toBeInstanceOf(ConflictException);

        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: s.id },
        });
        expect(row.planId).toBe(activeId);
        expect(row.pendingPlanId).toBeNull();
    });

    it('"Sell again" on a draft → 409; it stays a draft and nothing is recorded', async () => {
        const before = await prisma.subscriptionPlanEvent.count({
            where: { planId: draftId },
        });
        await expect(
            service.setPlanStatus(shop, draftId, "ACTIVE"),
        ).rejects.toThrow(PLAN_NOT_PUBLISHED);
        expect(await statusOf(draftId)).toBe("DRAFT");
        expect(
            await prisma.subscriptionPlanEvent.count({
                where: { planId: draftId },
            }),
        ).toBe(before);
    });

    it("archiving a draft → 409, so Sell again can't publish it later", async () => {
        await expect(
            service.setPlanStatus(shop, draftId, "ARCHIVED"),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await statusOf(draftId)).toBe("DRAFT");
    });

    it("the plans offered for sale never list a draft", async () => {
        // What the app's sign-up and change-plan pickers read.
        const onSale = await service.listPlans(shop, { status: "ACTIVE" });
        expect(onSale.map((p) => p.id)).toEqual([activeId]);

        // The filter every list of plans for sale uses.
        const views = await planViews(shop.organizationId, PLANS_ON_SALE);
        expect(views.map((p) => p.id)).toEqual([activeId]);
    });
});

describe("ACTIVE and ARCHIVED plans behave as today (D21, real database)", () => {
    it("an active plan sells", async () => {
        const s = await service.subscribe(shop, {
            contactId: await person(),
            planId: activeId,
        });
        expect(s.plan.id).toBe(activeId);
        expect(s.status).toBe("ACTIVE");
    });

    it("an archived plan is refused with today's 400 on planId", async () => {
        const attempt = service.subscribe(shop, {
            contactId: await person(),
            planId: archivedId,
        });
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.subscribe(shop, {
                contactId: await person(),
                planId: archivedId,
            }),
        ).rejects.toThrow(/archived/);
    });

    it("an archived plan can be sold again, and archived once more", async () => {
        const id = await plan("Weekend pass", "600");
        await service.setPlanStatus(shop, id, "ARCHIVED");
        expect((await service.setPlanStatus(shop, id, "ACTIVE")).status).toBe(
            "ACTIVE",
        );
        expect((await service.setPlanStatus(shop, id, "ARCHIVED")).status).toBe(
            "ARCHIVED",
        );
    });

    it("the staff list without a filter still lists every plan", async () => {
        const all = await service.listPlans(shop, {});
        expect(all.map((p) => p.id)).toEqual(
            expect.arrayContaining([activeId, archivedId, draftId]),
        );
    });
});
