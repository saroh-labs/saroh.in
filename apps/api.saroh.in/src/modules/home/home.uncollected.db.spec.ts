/**
 * Orders to pay on handover that nobody came for (R34), against a real
 * Postgres: on Home from the third day after they were placed in the
 * business's zone and not before, the days counting up, gone once paid,
 * handed over or cancelled, narrowed to a staff member's storefronts, never
 * another business's; and the team told once, however often the alert
 * runs, with the order left as it was.
 *
 * Runs in the integration project. Amounts are made up.
 */
import { prisma } from "@saroh/database";

import { tellTeam } from "../notifications/team-alert.handler";
import { flattenNeeds } from "./home-needs";
import { uncollectedOrders } from "./home-uncollected";

const ZONE = "Asia/Kolkata";
const tag = `${process.pid}-${Date.now()}`;
/** An instant in Kolkata, as `YYYY-MM-DDTHH:mm`. */
const at = (local: string) => new Date(`${local}:00.000+05:30`);
// Monday 5 Oct 2026, 22:00 in Kolkata.
const PLACED = at("2026-10-05T22:00");

let orgId: string;
let otherOrgId: string;
let storeId: string;
let otherStoreId: string;
let customerId: string;
let seq = 0;

beforeAll(async () => {
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `r34-${tag}` },
        })
    ).id;
    otherOrgId = (
        await prisma.organization.create({
            data: { name: "Elsewhere", slug: `r34-other-${tag}` },
        })
    ).id;
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: ZONE },
    });
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `r34-store-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    otherStoreId = (
        await prisma.store.create({
            data: {
                name: "Lake Road",
                slug: `r34-store2-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: "anika@example.in",
                firstName: "Anika",
                lastName: "Rao",
            },
        })
    ).id;
});

/** A website order to pay on collection, placed at `PLACED` unless told. */
async function placed(
    over: {
        store?: string;
        org?: string;
        createdAt?: Date;
        payOnHandover?: boolean;
    } = {},
) {
    seq += 1;
    const org = over.org ?? orgId;
    const store =
        over.org && over.org !== orgId
            ? (
                  await prisma.store.create({
                      data: {
                          name: "Other",
                          slug: `r34-os-${tag}-${seq}`,
                          organizationId: org,
                      },
                  })
              ).id
            : (over.store ?? storeId);
    return prisma.order.create({
        data: {
            storeId: store,
            organizationId: org,
            orderId: `R34-${seq}`,
            customerId: store === storeId ? customerId : null,
            walkInName: store === storeId ? null : "Ravi",
            currency: "INR",
            subtotal: "480.00",
            tax: "0.00",
            total: "480.00",
            status: "PROCESSING",
            stage: "READY",
            paymentStatus: "UNPAID",
            fulfilment: "PICKUP",
            placedOnline: true,
            payOnHandover: over.payOnHandover ?? true,
            createdAt: over.createdAt ?? PLACED,
        },
        select: { id: true, orderId: true },
    });
}

const home = (now: Date, storeIds: string[] | null = null) =>
    uncollectedOrders(prisma, orgId, {
        now,
        zone: ZONE,
        money: true,
        storeIds,
    });

const mine = (
    action: Awaited<ReturnType<typeof uncollectedOrders>>,
    id: string,
) => action?.evidence?.find((e) => e.id === id);

describe("orders nobody came for, on Home (R34)", () => {
    it("is on Home from the start of the third day, not a minute before", async () => {
        const order = await placed();
        expect(
            mine(await home(at("2026-10-07T23:59")), order.id),
        ).toBeUndefined();

        const action = await home(at("2026-10-08T00:00"));
        expect(action).toMatchObject({
            code: "COMMERCE_UNCOLLECTED_ORDERS",
            severity: "ATTENTION",
        });
        expect(mine(action, order.id)).toMatchObject({
            title: `#${order.orderId}`,
            subtitle: "Anika Rao",
            tag: "Not collected: 3 days",
            amountMinor: 48000,
            href: `/commerce/orders/${order.id}`,
        });
        const { needs } = flattenNeeds(action ? [action] : [], ZONE);
        expect(needs.find((n) => n.id.endsWith(order.id))?.title).toBe(
            `Anika Rao hasn't collected order #${order.orderId}`,
        );
    });

    it("stays while staff keep waiting, the days counting up", async () => {
        const order = await placed();
        expect(mine(await home(at("2026-10-12T09:00")), order.id)?.tag).toBe(
            "Not collected: 7 days",
        );
    });

    it("goes once it is paid, collected, or cancelled", async () => {
        const now = at("2026-10-10T09:00");
        const paid = await placed();
        const collected = await placed();
        const cancelled = await placed();
        await prisma.order.update({
            where: { id: paid.id },
            data: { paymentStatus: "PAID" },
        });
        await prisma.order.update({
            where: { id: collected.id },
            data: {
                paymentStatus: "PAID",
                status: "DELIVERED",
                stage: "COLLECTED",
            },
        });
        await prisma.order.update({
            where: { id: cancelled.id },
            data: { status: "CANCELLED" },
        });
        const action = await home(now);
        for (const o of [paid, collected, cancelled]) {
            expect(mine(action, o.id)).toBeUndefined();
        }
    });

    it("is only an order placed to be paid on handover", async () => {
        const later = await placed({ payOnHandover: false });
        expect(
            mine(await home(at("2026-10-10T09:00")), later.id),
        ).toBeUndefined();
    });

    it("a staff member's Home reads only their storefronts', and never another business's", async () => {
        const there = await placed({ store: otherStoreId });
        const elsewhere = await placed({ org: otherOrgId });
        const now = at("2026-10-10T09:00");
        expect(mine(await home(now, [storeId]), there.id)).toBeUndefined();
        expect(mine(await home(now), there.id)).toBeDefined();
        expect(mine(await home(now), elsewhere.id)).toBeUndefined();
    });
});

describe("the team's alert (R34)", () => {
    it("is told once, however often it runs, and leaves the order as it was", async () => {
        const order = await placed();
        const before = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        const payload = { event: "uncollected" as const, orderId: order.id };
        const first = await prisma.$transaction((tx) =>
            tellTeam(tx, orgId, payload, at("2026-10-08T00:05")),
        );
        const again = await prisma.$transaction((tx) =>
            tellTeam(tx, orgId, payload, at("2026-10-11T09:00")),
        );
        expect(first.told).toBe(true);
        expect(again.told).toBe(false);

        const notices = await prisma.notification.findMany({
            where: { organizationId: orgId, type: "order.uncollected" },
            select: { title: true },
        });
        expect(notices).toEqual([
            { title: `Not collected: order ${order.orderId} from Anika Rao` },
        ]);
        // Nothing cancels on its own: status, stage and stock stay put.
        const after = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(after.status).toBe(before.status);
        expect(after.stage).toBe(before.stage);
        expect(after.paymentStatus).toBe(before.paymentStatus);
    });

    it("isn't told before its day, or for an order paid since", async () => {
        const early = await placed();
        const paid = await placed();
        await prisma.order.update({
            where: { id: paid.id },
            data: { paymentStatus: "PAID" },
        });
        for (const [id, now] of [
            [early.id, at("2026-10-07T20:00")],
            [paid.id, at("2026-10-09T09:00")],
        ] as const) {
            const out = await prisma.$transaction((tx) =>
                tellTeam(tx, orgId, { event: "uncollected", orderId: id }, now),
            );
            expect(out.told).toBe(false);
        }
    });
});
