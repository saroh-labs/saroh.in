/**
 * Subscriptions against a real Postgres: what the row lock and the partial
 * unique indexes guarantee, which a mock cannot show. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import {
    SUBSCRIPTION_RENEW_TYPE,
    SubscriptionRenewHandler,
} from "./subscription-renew.handler";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());
const handler = new SubscriptionRenewHandler(service);

let org: OrganizationContext;
let contactId: string;
let planId: string;

async function makeOrg(slug: string): Promise<OrganizationContext> {
    const created = await prisma.organization.create({
        data: { name: slug, slug: `${slug}-${process.pid}` },
    });
    return { organizationId: created.id, userId: "user_1", role: "OWNER" };
}

beforeAll(async () => {
    org = await makeOrg("subs-org");
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.organizationId,
                email: "asha@example.com",
                firstName: "Asha",
            },
        })
    ).id;
    planId = (
        await service.createPlan(org, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
});

const invoicesOf = (subscriptionId: string) =>
    prisma.invoice.findMany({
        where: { subscriptionId },
        orderBy: { periodStart: "asc" },
    });

/** Someone new each time: a person may be on a plan only once at a time. */
let people = 0;
async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: org.organizationId,
                email: `member-${people}@example.com`,
            },
        })
    ).id;
}

/** Push a subscription's period into the past so it is due now. */
async function makeDue(id: string): Promise<void> {
    const start = new Date(Date.now() - 40 * 86_400_000);
    await prisma.customerSubscription.update({
        where: { id },
        data: {
            anchorAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: new Date(Date.now() - 86_400_000),
        },
    });
}

describe("subscriptions (real database)", () => {
    it("bills a backdated start for the current period only", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
            startDate: "2026-01-15",
        });
        const invoices = await invoicesOf(s.id);
        expect(invoices).toHaveLength(1);
        expect(invoices[0]!.periodStart).toEqual(
            new Date(s.currentPeriodStart),
        );
        expect(invoices[0]!.status).toBe("ISSUED");
    });

    it("renews a due subscription exactly once, however often and however concurrently it runs", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        await makeDue(s.id);
        const now = new Date();

        const outcomes = await Promise.all([
            service.renewOne(s.id, now),
            service.renewOne(s.id, now),
            service.renewOne(s.id, now),
        ]);
        expect(outcomes.filter((o) => o === "renewed")).toHaveLength(1);
        expect(outcomes.filter((o) => o === "skipped")).toHaveLength(2);

        await handler.renewDue(now);
        // One from signing up, one from the renewal.
        expect(await invoicesOf(s.id)).toHaveLength(2);
    });

    it("stays overdue for an unpaid old period after the next is issued", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        const [first] = await invoicesOf(s.id);
        await prisma.invoice.update({
            where: { id: first!.id },
            data: { dueAt: new Date(Date.now() - 86_400_000) },
        });
        await makeDue(s.id);
        await service.renewOne(s.id, new Date());

        const view = await service.get(org, s.id);
        expect(view.unpaidCount).toBe(2);
        expect(view.overdue).toBe(true);
        expect(view.oldestUnpaid?.id).toBe(first!.id);
    });

    it("never invoices after a cancel that won the race", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        await makeDue(s.id);
        await Promise.all([
            service.cancel(org, s.id, { when: "now" }),
            service.renewOne(s.id, new Date()),
        ]);
        const after = await service.get(org, s.id);
        expect(after.status).toBe("CANCELLED");
        const invoices = await invoicesOf(s.id);
        // Either the renewal ran first (two) or the cancel did (one) — never
        // an invoice for a period that starts after the cancel.
        for (const inv of invoices) {
            expect(inv.periodStart!.getTime()).toBeLessThanOrEqual(
                new Date(after.cancelledAt!).getTime(),
            );
        }
    });

    it("sends no renewal invoices to a business with Payments switched off", async () => {
        const off = await makeOrg("payments-off");
        const c = await prisma.contact.create({
            data: {
                organizationId: off.organizationId,
                email: "b@example.com",
            },
        });
        const p = await service.createPlan(off, {
            name: "Weekly",
            price: "300",
            currency: "INR",
            interval: "WEEK",
        });
        const s = await service.subscribe(off, {
            contactId: c.id,
            planId: p.id,
        });
        await prisma.organizationModule.create({
            data: {
                organizationId: off.organizationId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        await makeDue(s.id);

        await handler.renewDue(new Date());
        expect(await invoicesOf(s.id)).toHaveLength(1);
    });

    it("lets one of two subscribes at the same moment through", async () => {
        const results = await Promise.allSettled([
            service.subscribe(org, { contactId, planId }),
            service.subscribe(org, { contactId, planId }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find(
            (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        expect(String(refused.reason)).toMatch(/already on Monthly/);
        expect(
            await prisma.customerSubscription.count({
                where: { contactId, planId },
            }),
        ).toBe(1);
    });

    it("keeps one pending renewal run, however many times it is scheduled", async () => {
        await Promise.all([
            handler.schedule(new Date()),
            handler.schedule(new Date()),
            handler.schedule(new Date()),
        ]);
        expect(
            await prisma.job.count({
                where: { type: SUBSCRIPTION_RENEW_TYPE, status: "PENDING" },
            }),
        ).toBe(1);
    });
});
