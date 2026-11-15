/**
 * DEC-074 against a real Postgres: a location's team sees and moves that
 * location's orders, and only those.
 *
 * One business with two storefronts, Hill Road and Market. Ravi joins Hill
 * Road's team from a storefront invite, so he holds the "Storefront team"
 * role (`joinTeamFromStorefront`, as the API makes it) and a Viewer's
 * `StoreMembers` row on Hill Road alone. He:
 *
 * - lists Hill Road's orders, never Market's, with their money and no
 *   customer email or phone;
 * - reads a Hill Road order whole (money and prices), and Market's is a 404;
 * - moves a Hill Road order to Ready and back, and records its courier; a
 *   Market order's move, Undo, courier and bulk move are each a 403;
 * - takes and changes Hill Road's orders (owner, 13 Nov 2026), with his
 *   name on each step, and none at Market;
 * - takes payment for Hill Road's orders (owner, 13 Nov 2026), named on
 *   the timeline, and none for Market's;
 * - cancels, refunds, exports and lists customers never.
 *
 * Someone on the team with no storefront left sees no orders, never every
 * one; a Member is not narrowed. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "off",
    },
}));
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));

import { randomUUID } from "node:crypto";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CustomersService } from "../customers/customers.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { readStaffNarrow } from "../home/home-staff";
import { mayHearAbout } from "../notifications/alert-preferences";
import { OrganizationContextService } from "../organizations/organization-context.service";
import type { OrgAction } from "../organizations/organization-policy";
import {
    joinTeamFromStorefront,
    STOREFRONT_TEAM_ROLE_KEY,
} from "../organizations/storefront-team-role";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import type { CreateOrderDto } from "./dto";
import { OrderCancelService } from "./order-cancel.service";
import { OrderFulfilmentChangeService } from "./order-fulfilment-change.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { OTHER_LOCATION_REFUSAL } from "./order-location";
import { OrderPayLinkService } from "./order-pay-link.service";
import { OrderStageBatchService } from "./order-stage-batch.service";
import { ORDER_TAKEN_NOTE, OrdersService } from "./orders.service";
import { OrganizationOrdersController } from "./organization-orders.controller";

const tag = `${process.pid}-${Date.now()}`;
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const orders = new OrdersService(stores);
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const batches = new OrderStageBatchService();
const controller = new OrganizationOrdersController(
    orders,
    new OrderKitchenService(payments),
    new OrderPayLinkService(),
    new OrderFulfilmentChangeService(payments),
    new OrderCancelService(payments),
    batches,
);
const contexts = new OrganizationContextService();

let orgId = "";
let ownerId = "";
let raviId = "";
let leftId = "";
let memberId = "";
const hill = { id: "", product: "" };
const market = { id: "", product: "" };

/** The context the guard builds for a person, from their membership. */
function as(userId: string): Promise<OrganizationContext> {
    return contexts.resolve(userId, orgId) as Promise<OrganizationContext>;
}

/** An unpaid pick-up at a storefront, taken by the owner, for a customer. */
async function orderAt(store: typeof hill): Promise<string> {
    const made = await orders.create(store.id, ownerId, {
        items: [{ productId: store.product, quantity: 1 }],
        fulfilment: "PICKUP",
        customer: {
            email: `dec074-buyer-${tag}@example.in`,
            name: "Asha Rao",
            phone: "+919800000074",
        },
        payment: { kind: "LATER" },
    } as CreateOrderDto);
    // Paid at the counter, so the kitchen may start on it.
    await prisma.order.update({
        where: { id: made.id },
        data: { paymentStatus: "PAID" },
    });
    return made.id;
}

async function refusal(run: () => unknown): Promise<string> {
    try {
        await run();
    } catch (error) {
        if (error instanceof NotFoundException) return "404";
        if (error instanceof ForbiddenException) return "403";
        return `other: ${String(error)}`;
    }
    return "allowed";
}

async function storefront(name: string, slug: string, into: typeof hill) {
    into.id = (
        await stores.createForUser(ownerId, orgId, {
            name,
            slug: `dec074-${slug}-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId: into.id },
        create: {
            storeId: into.id,
            currency: "INR",
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
            collectionEnabled: true,
        },
        update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
    });
    into.product = (
        await products.create(into.id, ownerId, {
            name: `${name} sourdough`,
            price: "180",
        })
    ).id;
}

/** Someone on a storefront's team, joined as the API joins them. */
async function onStorefront(
    email: string,
    store: typeof hill | null,
): Promise<string> {
    const userId = (await prisma.user.create({ data: { email } })).id;
    const joinVia = store ?? hill;
    await prisma.$transaction(async (tx) => {
        await tx.storeMembers.create({
            data: { storeId: joinVia.id, userId, role: "VIEWER" },
        });
        await joinTeamFromStorefront(tx, {
            organizationId: orgId,
            userId,
            store: { id: joinVia.id, name: "Hill Road" },
            source: "invite",
            actorUserId: userId,
        });
    });
    // Taken off every storefront afterwards, and kept on the team.
    if (!store) await prisma.storeMembers.deleteMany({ where: { userId } });
    return userId;
}

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `dec074-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Northwind Bakes", slug: `dec074-org-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    await storefront("Hill Road", "hill", hill);
    await storefront("Market", "market", market);
    raviId = await onStorefront(`dec074-ravi-${tag}@example.com`, hill);
    leftId = await onStorefront(`dec074-left-${tag}@example.com`, null);
    memberId = (
        await prisma.user.create({
            data: { email: `dec074-member-${tag}@example.com` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: memberId, role: "MEMBER" },
    });
});

describe("the Storefront team role a storefront invite makes", () => {
    it("takes, changes and moves orders, which reads them; no customers, refunds or export", async () => {
        const ctx = await as(raviId);
        expect(ctx.roleKey).toBe(STOREFRONT_TEAM_ROLE_KEY);
        for (const action of [
            "order:stage",
            "order:create",
            "order:edit",
            "order:read",
        ] as const) {
            expect([action, ctx.actions?.has(action)]).toEqual([action, true]);
        }
        for (const action of [
            "contact:read",
            "order:refund",
            "order:export",
            "payment:read",
        ] as const) {
            expect([action, ctx.actions?.has(action)]).toEqual([action, false]);
        }
    });
});

describe("the Orders list: their storefront's, with its money", () => {
    it("lists Hill Road's orders and never Market's", async () => {
        const mine = await orderAt(hill);
        const theirs = await orderAt(market);
        const page = await controller.list(await as(raviId));
        const ids = page.rows.map((r) => r.id);
        expect(ids).toContain(mine);
        expect(ids).not.toContain(theirs);
        expect(page.rows.every((r) => r.store.id === hill.id)).toBe(true);
        // The tab counts count what the rows show.
        expect(page.counts.all).toBe(page.rows.length);
    });

    it("sends the money, and the customer by name only", async () => {
        const mine = await orderAt(hill);
        const page = await controller.list(await as(raviId));
        const row = page.rows.find((r) => r.id === mine);
        expect(row).toBeDefined();
        expect(row?.total).toBeDefined();
        expect(row?.customer?.name).toContain("Asha");
        expect(row?.customer?.email).toBeUndefined();
        expect(row?.customer?.phone).toBeUndefined();
    });

    it("a filter for Market finds nothing, rather than Market's orders", async () => {
        await orderAt(market);
        const page = await controller.list(await as(raviId), {
            storeId: market.id,
        });
        expect(page.rows).toEqual([]);
    });

    it("a Market order as the cursor is not there", async () => {
        const theirs = await orderAt(market);
        expect(
            await refusal(async () =>
                controller.list(await as(raviId), { cursor: theirs }),
            ),
        ).toBe("404");
    });

    it("someone on no storefront any more sees no orders at all", async () => {
        await orderAt(hill);
        const page = await controller.list(await as(leftId));
        expect(page.rows).toEqual([]);
    });

    it("a Member is not narrowed: both storefronts' orders", async () => {
        const mine = await orderAt(hill);
        const theirs = await orderAt(market);
        const ids = (await controller.list(await as(memberId))).rows.map(
            (r) => r.id,
        );
        expect(ids).toEqual(expect.arrayContaining([mine, theirs]));
    });
});

describe("Order Detail: their storefront's order, whole", () => {
    it("reads a Hill Road order with its money and prices, and no invoices", async () => {
        const mine = await orderAt(hill);
        const read = await controller.read(await as(raviId), mine);
        expect(read.money).not.toBeNull();
        expect(read.invoices).toBeNull();
        expect(read.items[0]).toHaveProperty("price");
        expect(read.customer?.name).toContain("Asha");
        expect(read.customer?.email).toBeUndefined();
        expect(read.customer?.phone).toBeNull();
    });

    it("a Market order is a 404, in the full read and the quick view", async () => {
        const theirs = await orderAt(market);
        const ctx = await as(raviId);
        expect(await refusal(() => controller.read(ctx, theirs))).toBe("404");
        expect(await refusal(() => controller.read(ctx, theirs, "quick"))).toBe(
            "404",
        );
    });
});

describe("moving orders: their storefront's, and a 403 for another's", () => {
    it("moves a Hill Road order to Ready, and undoes it", async () => {
        const mine = await orderAt(hill);
        const ctx = await as(raviId);
        await controller.moveStage(ctx, mine, { to: "PREPARING" });
        const ready = await controller.moveStage(ctx, mine, { to: "READY" });
        expect(ready.stage).toBe("READY");
        const back = await controller.undoStage(ctx, mine, {
            eventId: ready.eventId,
        });
        expect(back.stage).toBe("PREPARING");
    });

    it("refuses Market's move, Undo and courier in words", async () => {
        const theirs = await orderAt(market);
        const moved = await controller.moveStage(await as(ownerId), theirs, {
            to: "PREPARING",
        });
        const ctx = await as(raviId);
        await expect(
            controller.moveStage(ctx, theirs, { to: "READY" }),
        ).rejects.toThrow(OTHER_LOCATION_REFUSAL);
        expect(
            await refusal(() =>
                controller.undoStage(ctx, theirs, { eventId: moved.eventId }),
            ),
        ).toBe("403");
        expect(
            await refusal(() =>
                controller.edit(ctx, theirs, { courierName: "Dunzo" }),
            ),
        ).toBe("403");
        expect(
            await refusal(() => controller.markVisitAttended(ctx, theirs, 1)),
        ).toBe("403");
        // Nothing moved.
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: theirs } }))
                .stage,
        ).toBe("PREPARING");
    });

    it("an order that isn't there at all is still a 404", async () => {
        expect(
            await refusal(async () =>
                controller.moveStage(await as(raviId), "no-such-order", {
                    to: "READY",
                }),
            ),
        ).toBe("404");
    });

    it("a bulk move with a Market order in it is refused whole", async () => {
        const mine = await orderAt(hill);
        const theirs = await orderAt(market);
        const batchId = randomUUID();
        expect(
            await refusal(async () =>
                controller.createBatch(await as(raviId), {
                    batchId,
                    lines: [
                        { orderId: mine, from: "NEW", to: "PREPARING" },
                        { orderId: theirs, from: "NEW", to: "PREPARING" },
                    ],
                    now: true,
                }),
            ),
        ).toBe("403");
        expect(
            await prisma.orderStageBatch.count({ where: { id: batchId } }),
        ).toBe(0);
    });

    it("a bulk move of their own orders goes, and someone else's batch isn't theirs", async () => {
        const mine = await orderAt(hill);
        const ctx = await as(raviId);
        const view = await controller.createBatch(ctx, {
            batchId: randomUUID(),
            lines: [{ orderId: mine, from: "NEW", to: "PREPARING" }],
            now: true,
        });
        expect(view.status).toBe("COMMITTED");
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: mine } }))
                .stage,
        ).toBe("PREPARING");

        const owners = await controller.createBatch(await as(ownerId), {
            batchId: randomUUID(),
            lines: [
                {
                    orderId: await orderAt(market),
                    from: "NEW",
                    to: "PREPARING",
                },
            ],
        });
        expect(await refusal(() => controller.readBatch(ctx, owners.id))).toBe(
            "404",
        );
        expect(await refusal(() => controller.undoBatch(ctx, owners.id))).toBe(
            "404",
        );
    });
});

describe("taking and changing orders: their storefront's only (owner, 13 Nov 2026)", () => {
    const walkIn = (store: typeof hill, payment = "LATER") =>
        ({
            items: [{ productId: store.product, quantity: 1 }],
            fulfilment: "PICKUP",
            walkIn: { name: "Asha" },
            payment: { kind: payment },
        }) as CreateOrderDto;

    it("takes an order at Hill Road, and its timeline names him", async () => {
        const made = await orders.create(hill.id, raviId, walkIn(hill));
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: made.id },
            select: { storeId: true },
        });
        expect(order.storeId).toBe(hill.id);
        const taken = await prisma.orderEvent.findFirst({
            where: { orderId: made.id, note: ORDER_TAKEN_NOTE },
        });
        expect(taken?.actorUserId).toBe(raviId);
    });

    it("takes none at Market, and no order is made", async () => {
        const before = await prisma.order.count({
            where: { storeId: market.id },
        });
        expect(
            await refusal(() =>
                orders.create(market.id, raviId, walkIn(market)),
            ),
        ).toBe("403");
        expect(
            await prisma.order.count({ where: { storeId: market.id } }),
        ).toBe(before);
    });

    it("changes a Hill Road order, named on its timeline; Market's is a 403", async () => {
        const mine = await orderAt(hill);
        const theirs = await orderAt(market);
        const ctx = await as(raviId);
        expect(
            await refusal(() => controller.edit(ctx, mine, { notes: "Hi" })),
        ).toBe("allowed");
        const edit = await prisma.orderEvent.findFirst({
            where: { orderId: mine, kind: "EDIT" },
            orderBy: { createdAt: "desc" },
        });
        expect(edit?.actorUserId).toBe(raviId);
        expect(
            await refusal(() => controller.edit(ctx, theirs, { notes: "Hi" })),
        ).toBe("403");
        expect(
            await refusal(() =>
                controller.changeFulfilment(ctx, theirs, {
                    fulfilment: "LOCAL_DELIVERY",
                    shipping: "0",
                }),
            ),
        ).toBe("403");
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: theirs } }))
                .notes,
        ).not.toBe("Hi");
    });

    it("the storefront routes: Hill Road's orders with totals, Market's refused", async () => {
        const mine = await orderAt(hill);
        const theirs = await orderAt(market);
        expect(await refusal(() => orders.list(hill.id, raviId))).toBe(
            "allowed",
        );
        expect(await refusal(() => orders.get(hill.id, mine, raviId))).toBe(
            "allowed",
        );
        expect(await refusal(() => orders.list(market.id, raviId))).toBe("403");
        expect(await refusal(() => orders.get(market.id, theirs, raviId))).toBe(
            "403",
        );
        expect(
            await refusal(() =>
                orders.updateStatus(market.id, theirs, raviId, {
                    status: "PROCESSING",
                }),
            ),
        ).toBe("403");
    });

    it("takes payment for Hill Road's orders, and the timeline names him (owner, 13 Nov 2026)", async () => {
        // Paid at the counter with a new order.
        const cash = await orders.create(hill.id, raviId, {
            ...walkIn(hill),
            payment: { kind: "CASH", received: "180" },
        } as CreateOrderDto);
        const paidStep = await prisma.orderEvent.findFirst({
            where: {
                orderId: cash.id,
                kind: "STATUS",
                note: { not: ORDER_TAKEN_NOTE },
            },
        });
        expect(paidStep?.actorUserId).toBe(raviId);
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: cash.id } }))
                .paymentStatus,
        ).toBe("PAID");

        // Marked paid later, by hand.
        const unpaid = (await orders.create(hill.id, raviId, walkIn(hill))).id;
        expect(
            await refusal(() =>
                orders.updateStatus(hill.id, unpaid, raviId, {
                    paymentStatus: "PAID",
                }),
            ),
        ).toBe("allowed");
        const marked = await prisma.orderEvent.findFirst({
            where: {
                orderId: unpaid,
                kind: "STATUS",
                amountCents: { not: null },
            },
        });
        expect(marked?.actorUserId).toBe(raviId);

        // A pay link and a payment by hand pass the role's guards here; what
        // follows (a provider, something owed) is the order's own rule.
        const ctx = await as(raviId);
        const another = (await orders.create(hill.id, raviId, walkIn(hill))).id;
        expect(
            await refusal(() => controller.payLink(ctx, another)),
        ).not.toMatch(/^40[34]$/);
        const paid = await orderAt(hill);
        expect(
            await refusal(() =>
                controller.recordDifference(ctx, paid, { kind: "CASH" }),
            ),
        ).not.toMatch(/^40[34]$/);
    });

    it("takes no payment for Market's orders", async () => {
        const ctx = await as(raviId);
        expect(
            await refusal(() =>
                orders.create(market.id, raviId, {
                    ...walkIn(market),
                    payment: { kind: "CASH", received: "180" },
                } as CreateOrderDto),
            ),
        ).toBe("403");
        const unpaid = (await orders.create(market.id, ownerId, walkIn(market)))
            .id;
        expect(
            await refusal(() =>
                orders.updateStatus(market.id, unpaid, raviId, {
                    paymentStatus: "PAID",
                }),
            ),
        ).toBe("403");
        expect(await refusal(() => controller.payLink(ctx, unpaid))).toBe(
            "403",
        );
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: unpaid } }))
                .paymentStatus,
        ).toBe("UNPAID");
        expect(
            await refusal(async () =>
                controller.recordDifference(ctx, await orderAt(market), {
                    kind: "CASH",
                }),
            ),
        ).toBe("403");
    });

    it("cancels, refunds, exports and lists customers never", async () => {
        const mine = await orderAt(hill);
        const ctx = await as(raviId);
        expect(
            await refusal(() =>
                controller.cancel(ctx, mine, { idempotencyKey: `x-${mine}` }),
            ),
        ).toBe("403");
        expect(
            await refusal(() => controller.list(ctx, { export: "true" })),
        ).toBe("403");
        expect(
            await refusal(() => payments.initiateRefund(ctx, mine, {})),
        ).toBe("403");
        expect(
            await refusal(() =>
                new CustomersService(stores).list(hill.id, raviId),
            ),
        ).toBe("403");
    });
});

describe("Home and alerts follow the same line", () => {
    it("Home narrows to their storefront, and to none once they're on none", async () => {
        const input = (userId: string) => ({
            organizationId: orgId,
            userId,
            organizationRole: "MEMBER" as const,
            organizationRoleKey: STOREFRONT_TEAM_ROLE_KEY,
        });
        expect(
            (await readStaffNarrow(prisma, input(raviId))).narrow.storeIds,
        ).toEqual([hill.id]);
        expect(
            (await readStaffNarrow(prisma, input(leftId))).narrow.storeIds,
        ).toEqual([]);
        // A Member on no storefront still sees the whole business.
        expect(
            (
                await readStaffNarrow(prisma, {
                    ...input(memberId),
                    organizationRoleKey: "MEMBER",
                })
            ).narrow.storeIds,
        ).toBeNull();
    });

    it("isn't offered the business-wide New order alert", async () => {
        const ctx = await as(raviId);
        const has = (a: OrgAction) => ctx.actions?.has(a) ?? false;
        expect(mayHearAbout("order", has, ctx.roleKey)).toBe(false);
        expect(mayHearAbout("order", has, "MEMBER")).toBe(true);
    });
});
