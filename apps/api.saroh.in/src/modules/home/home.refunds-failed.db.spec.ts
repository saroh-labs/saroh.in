/**
 * A refund the provider failed becomes a Needs you row (B9, DEC-067),
 * against a real Postgres: raised by a FAILED order refund, cleared by a
 * later refund of the same order that hasn't failed, narrowed to a staff
 * member's storefronts, and never another business's.
 *
 * Runs in the integration project.
 */
import { prisma } from "@saroh/database";

import { flattenNeeds } from "./home-needs";
import { failedOrderRefunds } from "./home-refunds-failed";

const tag = `${process.pid}-${Date.now()}`;
let orgId: string;
let otherOrgId: string;
let storeId: string;
let otherStoreId: string;
let customerId: string;
let seq = 0;

beforeAll(async () => {
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `b9h-${tag}` },
        })
    ).id;
    otherOrgId = (
        await prisma.organization.create({
            data: { name: "Elsewhere", slug: `b9h-other-${tag}` },
        })
    ).id;
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `b9h-store-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    otherStoreId = (
        await prisma.store.create({
            data: {
                name: "Lake Road",
                slug: `b9h-store2-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: "priya@example.in",
                firstName: "Priya",
                lastName: "Raman",
            },
        })
    ).id;
});

/** A paid, cancelled order with a refund in the given state. */
async function cancelled(
    refund: "FAILED" | "PENDING" | "SUCCEEDED",
    at: { store?: string; org?: string } = {},
) {
    seq += 1;
    const org = at.org ?? orgId;
    const store =
        at.org && at.org !== orgId
            ? (
                  await prisma.store.create({
                      data: {
                          name: "Other",
                          slug: `b9h-os-${tag}-${seq}`,
                          organizationId: org,
                      },
                  })
              ).id
            : (at.store ?? storeId);
    const order = await prisma.order.create({
        data: {
            storeId: store,
            organizationId: org,
            orderId: `B9H-${seq}`,
            customerId: store === storeId ? customerId : null,
            currency: "INR",
            subtotal: "480.00",
            tax: "0.00",
            total: "480.00",
            status: "CANCELLED",
            paymentStatus: "PAID",
            fulfilment: "PICKUP",
        },
        select: { id: true, orderId: true },
    });
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: org,
            orderId: order.id,
            provider: "razorpay",
            amountCents: 48000,
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
    const row = await prisma.paymentRefund.create({
        data: {
            organizationId: org,
            paymentIntentId: intent.id,
            amountCents: 48000,
            currency: "INR",
            status: refund,
            providerRefundId: `rfnd_${tag}_${seq}`,
        },
    });
    return { order, intent, refund: row };
}

const mine = (
    action: Awaited<ReturnType<typeof failedOrderRefunds>>,
    refundId: string,
) => action?.evidence?.find((e) => e.id === refundId);

describe("failed order refunds on Home (B9, DEC-067)", () => {
    it("a refund the provider failed is a Needs you row, with the order and who", async () => {
        const { order, refund } = await cancelled("FAILED");
        const action = await failedOrderRefunds(prisma, orgId);
        expect(action).toMatchObject({
            code: "COMMERCE_REFUNDS_FAILED",
            severity: "ATTENTION",
            moduleKey: "COMMERCE",
        });
        const ev = mine(action, refund.id);
        expect(ev).toMatchObject({
            title: `#${order.orderId}`,
            subtitle: "Priya Raman",
            amountMinor: 48000,
            currency: "INR",
            href: `/commerce/orders/${order.id}?panel=refund`,
            tag: "Refund failed",
            tone: "bad",
        });
        expect(ev?.detail).toBe(
            "Razorpay couldn't send it back. The money is still with you.",
        );

        // Flattened, it reads as money with its words, ranked as late.
        const { needs } = flattenNeeds(action ? [action] : [], "Asia/Kolkata");
        const row = needs.find((n) => n.id.endsWith(refund.id));
        expect(row).toMatchObject({
            title: "refund to Priya Raman failed",
            amountIn: "title",
            tag: "Refund failed",
        });
        expect(row?.sub).toContain(`Order #${order.orderId}`);
    });

    it("a refund still on its way, or confirmed, is no row", async () => {
        const pending = await cancelled("PENDING");
        const done = await cancelled("SUCCEEDED");
        const action = await failedOrderRefunds(prisma, orgId);
        expect(mine(action, pending.refund.id)).toBeUndefined();
        expect(mine(action, done.refund.id)).toBeUndefined();
    });

    it("refunding the order again clears it; that one failing too raises it again", async () => {
        const { intent, refund } = await cancelled("FAILED");
        const again = await prisma.paymentRefund.create({
            data: {
                organizationId: orgId,
                paymentIntentId: intent.id,
                amountCents: 48000,
                currency: "INR",
                status: "PENDING",
                createdAt: new Date(refund.createdAt.getTime() + 60_000),
            },
        });
        expect(
            mine(await failedOrderRefunds(prisma, orgId), refund.id),
        ).toBeUndefined();

        await prisma.paymentRefund.update({
            where: { id: again.id },
            data: { status: "FAILED" },
        });
        const action = await failedOrderRefunds(prisma, orgId);
        expect(mine(action, again.id)).toBeDefined();
    });

    it("a staff member's Home reads only their storefronts'", async () => {
        const there = await cancelled("FAILED", { store: otherStoreId });
        expect(
            mine(
                await failedOrderRefunds(prisma, orgId, [storeId]),
                there.refund.id,
            ),
        ).toBeUndefined();
        expect(
            mine(
                await failedOrderRefunds(prisma, orgId, [otherStoreId]),
                there.refund.id,
            ),
        ).toBeDefined();
    });

    it("never another business's", async () => {
        const theirs = await cancelled("FAILED", { org: otherOrgId });
        expect(
            mine(await failedOrderRefunds(prisma, orgId), theirs.refund.id),
        ).toBeUndefined();
    });

    it("nothing failed is no action at all", async () => {
        const quiet = (
            await prisma.organization.create({
                data: { name: "Quiet", slug: `b9h-quiet-${tag}` },
            })
        ).id;
        expect(await failedOrderRefunds(prisma, quiet)).toBeNull();
    });
});
