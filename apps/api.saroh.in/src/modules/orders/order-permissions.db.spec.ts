/**
 * The order permissions matrix (round-2 B16, DEC-039; permission matrix §2
 * and §3) against a real Postgres: every order endpoint asks its own power,
 * and the matrix's order rows match the API's refusals one to one.
 *
 * | Endpoint                                   | Asks                                   |
 * | ------------------------------------------ | -------------------------------------- |
 * | GET  orders, filters, products, one order  | `order:read` or `order:stage`          |
 * | GET  orders?export=true                    | `order:export`                         |
 * | POST orders/:id/stage, stage/undo          | `order:stage`                          |
 * | PATCH orders/:id (courier and number only) | `order:stage`                          |
 * | PATCH orders/:id                           | `order:edit` (+ `order:refund` paid)   |
 * | POST orders/:id/fulfilment                 | `order:edit` (+ `order:refund` paid)   |
 * | POST orders/:id/pay-link                   | `order:create` or `order:edit`         |
 * | POST orders/:id/cancel                     | `order:refund`                         |
 * | POST orders/:id/refund, refunds/:id/retry  | `order:refund`                         |
 * | POST stores/:id/orders, GET …/new-order    | `order:create` (+ `contact:read` for a |
 * |                                            | picked person; the pay link the same)  |
 * | PATCH stores/:id/orders/:id                | `order:edit`; cancel/refunded `order:refund` |
 *
 * Roles are the business's own (stored rows, resolved with their implied
 * holds): a role saved with `order:write` before the split still takes,
 * changes and exports; `payment:manage` still refunds. The provider is the
 * network-free fake; only the app env is stubbed. Runs in the integration
 * project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "off",
    },
}));
// The guards pull in Better Auth, which Jest cannot parse; the controller's
// own checks are what this spec is about.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import type { OrgAction } from "../organizations/organization-policy";
import { resolveCapabilities } from "../organizations/organization-policy";
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
import { OrderPayLinkService } from "./order-pay-link.service";
import { OrdersService } from "./orders.service";
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
const kitchen = new OrderKitchenService(payments);
const controller = new OrganizationOrdersController(
    orders,
    kitchen,
    new OrderPayLinkService(),
    new OrderFulfilmentChangeService(payments),
    new OrderCancelService(payments),
);

/** The business's own roles, as a custom role is stored (key → actions). */
const ROLES: Record<string, OrgAction[]> = {
    // Saved before the split: the old umbrella.
    "senior-b16": ["order:write", "contact:read"],
    // Counter staff: take orders, and look customers up.
    "counter-b16": ["order:create", "contact:read"],
    "editor-b16": ["order:edit"],
    "refunds-b16": ["order:refund"],
    "exporter-b16": ["order:export"],
    "cashier-b16": ["payment:manage"],
    // The kitchen: move orders, no money (DEC-024 until F18).
    "kitchen-b16": ["order:stage", "contact:read", "store:read"],
    // Changes storefronts, which is not taking orders (matrix §3).
    "shopfitter-b16": ["store:read", "store:write"],
    // Sees customers and nothing of orders.
    "desk-b16": ["contact:read", "store:read"],
};
type RoleKey = keyof typeof ROLES;

let orgId = "";
let ownerId = "";
let storeId = "";
let bread = "";
const users: Record<string, string> = {};

/** The organization context the guard would build for this role. */
function as(key: RoleKey): OrganizationContext {
    return {
        organizationId: orgId,
        userId: users[key],
        role: "MEMBER",
        roleKey: key,
        actions: resolveCapabilities(key, ROLES[key]),
    };
}

/** Refused (a 403), or let through to whatever the request itself meets. */
async function gate(run: () => unknown): Promise<"allowed" | "refused"> {
    try {
        await run();
    } catch (error) {
        if (error instanceof ForbiddenException) return "refused";
    }
    return "allowed";
}

/**
 * The store-scoped routes: a role that can't even see the storefront is
 * told it isn't there (a 404, no existence leak), which is a refusal too.
 */
async function storeGate(run: () => unknown): Promise<"allowed" | "refused"> {
    try {
        await run();
    } catch (error) {
        if (
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
        ) {
            return "refused";
        }
    }
    return "allowed";
}

/** A fresh unpaid pick-up order, taken by the owner, for a known customer. */
async function freshOrder(): Promise<string> {
    const made = await orders.create(storeId, ownerId, {
        items: [{ productId: bread, quantity: 1 }],
        fulfilment: "PICKUP",
        customer: { email: `b16-buyer-${tag}@example.in` },
        payment: { kind: "LATER" },
    } as CreateOrderDto);
    return made.id;
}

const newOrderDto = (): CreateOrderDto =>
    ({
        items: [{ productId: bread, quantity: 1 }],
        fulfilment: "PICKUP",
        walkIn: { name: "Asha" },
        payment: { kind: "LATER" },
    }) as CreateOrderDto;

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `b16-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Hill Road Bakes", slug: `b16-org-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    await prisma.organizationRole.createMany({
        data: Object.entries(ROLES).map(([key, actions]) => ({
            organizationId: orgId,
            key,
            label: key,
            actions,
        })),
    });
    for (const key of Object.keys(ROLES)) {
        users[key] = (
            await prisma.user.create({
                data: { email: `b16-${key}-${tag}@example.com` },
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: users[key], role: key },
        });
    }
    storeId = (
        await stores.createForUser(ownerId, orgId, {
            name: "Hill Road",
            slug: `b16-hill-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
            collectionEnabled: true,
            shippingEnabled: true,
        },
        update: {
            currency: "INR",
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
        },
    });
    bread = (
        await products.create(storeId, ownerId, {
            name: "Sourdough",
            price: "180",
        })
    ).id;
});

describe("reading orders: order:read or order:stage", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["kitchen-b16", "allowed"],
        // Each order power shows the whole order it acts on.
        ["counter-b16", "allowed"],
        ["editor-b16", "allowed"],
        ["refunds-b16", "allowed"],
        ["exporter-b16", "allowed"],
        ["senior-b16", "allowed"],
        ["cashier-b16", "allowed"],
        ["desk-b16", "refused"],
        ["shopfitter-b16", "refused"],
    ])("%s → the list, its filters and one order: %s", async (key, want) => {
        const id = await freshOrder();
        expect(await gate(() => controller.list(as(key)))).toBe(want);
        expect(await gate(() => controller.filters(as(key)))).toBe(want);
        expect(await gate(() => controller.products(as(key)))).toBe(want);
        expect(await gate(() => controller.read(as(key), id))).toBe(want);
        expect(await gate(() => controller.read(as(key), id, "quick"))).toBe(
            want,
        );
    });

    it("a role with order:create alone sees the order whole, money included", async () => {
        const id = await freshOrder();
        const read = await controller.read(as("counter-b16"), id);
        expect(read.money).not.toBeNull();
        expect(read.items[0]).toHaveProperty("price");
        const page = await controller.list(as("counter-b16"));
        expect(page.rows.find((r) => r.id === id)?.total).toBeDefined();
    });

    it("the kitchen reads no money, but sees the customer's email with contact:read (today's decision)", async () => {
        const id = await freshOrder();
        const read = await controller.read(as("kitchen-b16"), id);
        expect(read.money).toBeNull();
        expect(read.customer?.email).toBe(`b16-buyer-${tag}@example.in`);
    });
});

describe("Export: order:export", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["exporter-b16", "allowed"],
        // Saved before the split: order:write includes it.
        ["senior-b16", "allowed"],
        ["counter-b16", "refused"],
        ["editor-b16", "refused"],
        ["refunds-b16", "refused"],
        ["kitchen-b16", "refused"],
    ])("%s: %s", async (key, want) => {
        expect(
            await gate(() => controller.list(as(key), { export: "true" })),
        ).toBe(want);
    });
});

describe("moving an order through its steps: order:stage", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["kitchen-b16", "allowed"],
        ["counter-b16", "refused"],
        ["editor-b16", "refused"],
        ["senior-b16", "refused"],
    ])("%s moves and records the courier: %s", async (key, want) => {
        const id = await freshOrder();
        expect(
            await gate(() =>
                controller.moveStage(as(key), id, { to: "PREPARING" }),
            ),
        ).toBe(want);
        expect(
            await gate(() =>
                controller.edit(as(key), id, { courierName: "Dunzo" }),
            ),
        ).toBe(want);
    });
});

describe("changing a placed order: order:edit", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["editor-b16", "allowed"],
        ["senior-b16", "allowed"],
        ["counter-b16", "refused"],
        ["refunds-b16", "refused"],
        ["kitchen-b16", "refused"],
    ])("%s edits and changes how it's fulfilled: %s", async (key, want) => {
        const id = await freshOrder();
        expect(
            await gate(() =>
                controller.edit(as(key), id, { notes: "No sesame" }),
            ),
        ).toBe(want);
        expect(
            await gate(() =>
                controller.changeFulfilment(as(key), id, {
                    fulfilment: "LOCAL_DELIVERY",
                    shipping: "40",
                    address: {
                        line1: "12 Hill Road",
                        city: "Mumbai",
                        state: "27",
                        postalCode: "400050",
                    },
                } as never),
            ),
        ).toBe(want);
    });

    it("a paid order's items change only with order:refund as well", async () => {
        const id = await freshOrder();
        await prisma.order.update({
            where: { id },
            data: { paymentStatus: "PAID" },
        });
        const item = await prisma.orderItem.findFirstOrThrow({
            where: { orderId: id },
        });
        expect(
            await gate(() =>
                controller.edit(as("editor-b16"), id, {
                    lines: [{ itemId: item.id, quantity: 2 }],
                }),
            ),
        ).toBe("refused");
    });
});

describe("a pay link: order:create or order:edit", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["counter-b16", "allowed"],
        ["editor-b16", "allowed"],
        ["senior-b16", "allowed"],
        ["refunds-b16", "refused"],
        ["exporter-b16", "refused"],
        ["kitchen-b16", "refused"],
    ])("%s: %s", async (key, want) => {
        const id = await freshOrder();
        // With no provider connected an allowed caller meets a 409, which is
        // the request's own refusal, not the role's.
        expect(await gate(() => controller.payLink(as(key), id))).toBe(want);
    });
});

describe("cancel and refund: order:refund", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["refunds-b16", "allowed"],
        // payment:manage always refunded; it implies order:refund.
        ["cashier-b16", "allowed"],
        // order:write never refunded, and a cancel is a refund in full.
        ["senior-b16", "refused"],
        ["editor-b16", "refused"],
        ["counter-b16", "refused"],
        ["kitchen-b16", "refused"],
    ])("%s: %s", async (key, want) => {
        const id = await freshOrder();
        expect(
            await gate(() =>
                controller.cancel(as(key), id, {
                    idempotencyKey: `b16-${key}-${id}`,
                }),
            ),
        ).toBe(want);
        const other = await freshOrder();
        // Nothing was paid, so an allowed caller meets a 400: nothing to
        // refund. The role is what this asks.
        expect(
            await gate(() => payments.initiateRefund(as(key), other, {})),
        ).toBe(want);
        expect(
            await gate(() =>
                payments.retryRefund(as(key), other, "no-such-refund"),
            ),
        ).toBe(want);
    });

    it("an allowed cancel of an unpaid order cancels it", async () => {
        const id = await freshOrder();
        const out = await controller.cancel(as("refunds-b16"), id, {
            idempotencyKey: `b16-cancel-${id}`,
        });
        expect(out.cancelled).toBe(true);
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id } })).status,
        ).toBe("CANCELLED");
    });
});

describe("New order, store-scoped: order:create", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["counter-b16", "allowed"],
        ["senior-b16", "allowed"],
        ["editor-b16", "refused"],
        ["kitchen-b16", "refused"],
        // Changing storefronts is not taking orders.
        ["shopfitter-b16", "refused"],
    ])(
        "%s takes a walk-in and reads New order's lines: %s",
        async (key, want) => {
            expect(
                await storeGate(() =>
                    orders.create(storeId, users[key], newOrderDto()),
                ),
            ).toBe(want);
            expect(
                await storeGate(() =>
                    orders.newOrderLines(storeId, users[key], [bread]),
                ),
            ).toBe(want);
        },
    );

    it("refuses the kitchen in words, and makes no order", async () => {
        const before = await prisma.order.count({ where: { storeId } });
        await expect(
            orders.create(storeId, users["kitchen-b16"], newOrderDto()),
        ).rejects.toThrow("Your role can't take new orders.");
        expect(await prisma.order.count({ where: { storeId } })).toBe(before);
    });

    it("a picked person still takes contact:read", async () => {
        const contact = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `b16-picked-${tag}@example.in`,
                firstName: "Meera",
            },
        });
        const dto = {
            ...newOrderDto(),
            walkIn: undefined,
            contactId: contact.id,
        } as CreateOrderDto;
        // `order:create` without `contact:read`: an order:write role saved
        // without it would be refused the same way.
        await prisma.organizationRole.update({
            where: {
                organizationId_key: {
                    organizationId: orgId,
                    key: "editor-b16",
                },
            },
            data: { actions: ["order:edit", "order:create"] },
        });
        try {
            await expect(
                orders.create(storeId, users["editor-b16"], dto),
            ).rejects.toThrow(/can't look customers up/);
        } finally {
            await prisma.organizationRole.update({
                where: {
                    organizationId_key: {
                        organizationId: orgId,
                        key: "editor-b16",
                    },
                },
                data: { actions: ROLES["editor-b16"] },
            });
        }
    });

    it("a pay link with a new order takes order:create too", async () => {
        const dto = {
            ...newOrderDto(),
            payment: { kind: "LINK" },
        } as CreateOrderDto;
        // Allowed to try: with no provider it is a 409, never a 403.
        expect(
            await gate(() => orders.create(storeId, users["counter-b16"], dto)),
        ).toBe("allowed");
    });
});

describe("the storefront's status write: order:edit, and order:refund to cancel", () => {
    it.each<[RoleKey, "allowed" | "refused", "allowed" | "refused"]>([
        ["editor-b16", "allowed", "refused"],
        ["refunds-b16", "refused", "allowed"],
        ["senior-b16", "allowed", "refused"],
        ["kitchen-b16", "refused", "refused"],
    ])("%s records paid: %s; cancels: %s", async (key, paid, cancel) => {
        const a = await freshOrder();
        expect(
            await storeGate(() =>
                orders.updateStatus(storeId, a, users[key], {
                    paymentStatus: "PAID",
                }),
            ),
        ).toBe(paid);
        const b = await freshOrder();
        expect(
            await storeGate(() =>
                orders.updateStatus(storeId, b, users[key], {
                    status: "CANCELLED",
                }),
            ),
        ).toBe(cancel);
    });
});

/**
 * A person's extra permissions (F17, DEC-039): a Member given `order:refund`
 * refunds and still can't edit an order, resolved the way the guard resolves
 * every request, and loses it on the next request once it is taken away.
 */
describe("an extra permission for one person (F17)", () => {
    const contexts = new OrganizationContextService();
    const audit = { record: jest.fn() } as unknown as AuditService;
    const members = new OrganizationMembersService(audit);
    let memberId = "";

    beforeAll(async () => {
        memberId = (
            await prisma.user.create({
                data: { email: `f17-member-${tag}@example.com` },
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: memberId, role: "MEMBER" },
        });
    });

    it("refunds, still can't edit, and loses it when taken away", async () => {
        const owner = await contexts.resolve(ownerId, orgId);
        await members.setExtraActions(owner, memberId, {
            actions: ["order:refund"],
        });

        const given = await contexts.resolve(memberId, orgId);
        const id = await freshOrder();
        expect(
            await gate(() =>
                controller.cancel(given, id, {
                    idempotencyKey: `f17-${id}`,
                }),
            ),
        ).toBe("allowed");
        const other = await freshOrder();
        expect(
            await gate(() =>
                controller.edit(given, other, { notes: "No sesame" }),
            ),
        ).toBe("refused");
        // The refund shows the order it refunds (implied `order:read`).
        expect(await gate(() => controller.read(given, other))).toBe("allowed");

        await members.setExtraActions(owner, memberId, { actions: [] });
        const taken = await contexts.resolve(memberId, orgId);
        const third = await freshOrder();
        expect(
            await gate(() =>
                controller.cancel(taken, third, {
                    idempotencyKey: `f17-${third}`,
                }),
            ),
        ).toBe("refused");
    });
});
