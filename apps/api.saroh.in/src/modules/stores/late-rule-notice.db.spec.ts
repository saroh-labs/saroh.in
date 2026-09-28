/**
 * Orders' one-time notice about the new Pick-up default (plan B, B17),
 * against a real Postgres: it shows for a storefront with pick-up orders in
 * the last 30 days that is still on 2 hours, not once it is dismissed or
 * its threshold changed, never for one without recent pick-ups, and never
 * across businesses. Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { StorefrontsService } from "./storefronts.service";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60_000;
const service = new StorefrontsService();

let orgId: string;
let otherOrgId: string;
let seq = 0;

async function store(organizationId: string, name: string): Promise<string> {
    return (
        await prisma.store.create({
            data: {
                name,
                slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
                organizationId,
            },
        })
    ).id;
}

async function order(
    organizationId: string,
    storeId: string,
    fulfilment: "PICKUP" | "SHIPPING",
    daysAgo: number,
) {
    seq += 1;
    const customer = await prisma.customer.create({
        data: {
            storeId,
            organizationId,
            email: `buyer-${seq}-${tag}@example.in`,
        },
    });
    await prisma.order.create({
        data: {
            storeId,
            organizationId,
            customerId: customer.id,
            orderId: `NOTICE-${seq}`,
            subtotal: "100.00",
            total: "100.00",
            currency: "INR",
            fulfilment,
            createdAt: new Date(Date.now() - daysAgo * DAY),
        },
    });
}

const names = async (organizationId: string) =>
    (await service.lateRuleNotices(organizationId)).map((n) => n.name).sort();

beforeAll(async () => {
    orgId = (
        await prisma.organization.create({
            data: { name: "Cafés", slug: `notice-${tag}` },
        })
    ).id;
    otherOrgId = (
        await prisma.organization.create({
            data: { name: "Elsewhere", slug: `notice-else-${tag}` },
        })
    ).id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("the late rule notice", () => {
    let counter: string;
    let legacy: string;
    let shipsOnly: string;
    let quiet: string;
    let changed: string;

    beforeAll(async () => {
        // Recent pick-ups, no settings saved yet: on the default.
        counter = await store(orgId, "Counter");
        await order(orgId, counter, "PICKUP", 2);
        // Recent pick-ups, settings saved.
        legacy = await store(orgId, "Legacy");
        await prisma.storeSettings.create({ data: { storeId: legacy } });
        await order(orgId, legacy, "PICKUP", 29);
        // Only shipping orders.
        shipsOnly = await store(orgId, "Ships");
        await order(orgId, shipsOnly, "SHIPPING", 1);
        // Pick-ups, but not in the last 30 days.
        quiet = await store(orgId, "Quiet");
        await order(orgId, quiet, "PICKUP", 45);
        // Recent pick-ups, already on its own threshold.
        changed = await store(orgId, "Changed");
        await prisma.storeSettings.create({
            data: { storeId: changed, pickupLateAfterMinutes: 20 },
        });
        await order(orgId, changed, "PICKUP", 1);
        // Another business's counter, on the default.
        const elsewhere = await store(otherOrgId, "Elsewhere");
        await order(otherOrgId, elsewhere, "PICKUP", 1);
    });

    it("shows for recent pick-ups on the default, and nowhere else", async () => {
        expect(await names(orgId)).toEqual(["Counter", "Legacy"]);
        const [first] = await service.lateRuleNotices(orgId);
        expect(first).toMatchObject({ pickupLateAfterMinutes: 120 });
    });

    it("stops once dismissed, for the storefront, even without a settings row", async () => {
        await service.dismissLateRuleNotice(orgId, counter);
        await service.dismissLateRuleNotice(orgId, counter);
        expect(await names(orgId)).toEqual(["Legacy"]);
        const settings = await prisma.storeSettings.findUniqueOrThrow({
            where: { storeId: counter },
        });
        expect(settings.lateRuleNoticeDismissedAt).toBeInstanceOf(Date);
        // A settings row made by dismissing keeps what the storefront read.
        expect(settings.pickupLateAfterMinutes).toBe(120);
    });

    it("stops once the Pick-up threshold is changed", async () => {
        await service.update(orgId, legacy, {
            lateAfterMinutes: { PICKUP: 20 },
        });
        expect(await names(orgId)).toEqual([]);
    });

    it("refuses to dismiss another business's storefront", async () => {
        const [elsewhere] = await service.lateRuleNotices(otherOrgId);
        expect(elsewhere?.name).toBe("Elsewhere");
        await expect(
            service.dismissLateRuleNotice(orgId, elsewhere!.storeId),
        ).rejects.toThrow(NotFoundException);
        expect(await names(otherOrgId)).toEqual(["Elsewhere"]);
    });
});
