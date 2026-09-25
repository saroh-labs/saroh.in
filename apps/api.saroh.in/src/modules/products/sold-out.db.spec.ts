/**
 * Sold out by hand (#515, DEC-032 amended), against a real Postgres: an
 * untracked product marked Sold out at one storefront refuses new staff
 * orders and paid checkouts there — in a counted Sold out's words — and
 * nowhere else, until it is marked available; open orders keep what they
 * have; a product that counts stock is refused; turning tracking on (the
 * product's switch, or the business's) clears it; who may do it; another
 * business's product or storefront is not found; marking twice changes
 * nothing; and each change is one audit row.
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { reserveOnPayment } from "../stock/reserve";
import { SOLD_OUT_NEEDS_UNTRACKED } from "../stock/sold-out";
import { StockReadsService } from "../stock/stock-reads.service";
import { StockTrackingService } from "../stock/stock-tracking.service";
import { SOLD_OUT_WHILE_PAYING } from "../stock/stock-words";
import { count } from "../stock/stock.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ProductAccess } from "./product-access";
import { ProductsService } from "./products.service";
import { SoldOutService } from "./sold-out.service";

const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const access = new ProductAccess(stores);
const products = new ProductsService(stores, undefined, access);
const inventory = new InventoryService(products);
const orders = new OrdersService(stores);
const business = new StockTrackingService();
const reads = new StockReadsService();
const soldOut = new SoldOutService(access, new AuditService());

let orgId = "";
let otherOrgId = "";
let otherStore = "";
let otherProduct = "";
let ownerId = "";
let clerkId = "";
let memberId = "";
let hill = "";
let online = "";
const customer: Record<string, string> = {};
let seq = 0;

const owner = (): OrganizationContext => ({
    organizationId: orgId,
    userId: ownerId,
    role: "OWNER",
});

/** A stock clerk: may count and move stock, not change products. */
const clerk = (): OrganizationContext => ({
    organizationId: orgId,
    userId: clerkId,
    role: "MEMBER",
    roleKey: "clerk",
    actions: resolveCapabilities("clerk", ["store:read", "inventory:write"]),
});

/** The read-only floor: neither `inventory:write` nor `store:write`. */
const member = (): OrganizationContext => ({
    organizationId: orgId,
    userId: memberId,
    role: "MEMBER",
});

const user = async (name: string) =>
    (
        await prisma.user.create({
            data: { email: `so-${name}-${tag}@example.com` },
        })
    ).id;

async function storefront(organizationId: string, name: string) {
    return (
        await prisma.store.create({
            data: {
                name,
                slug: `so-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                organizationId,
            },
        })
    ).id;
}

beforeAll(async () => {
    ownerId = await user("owner");
    clerkId = await user("clerk");
    memberId = await user("member");
    orgId = (
        await prisma.organization.create({
            data: { name: "Northwind", slug: `so-nw-${tag}` },
        })
    ).id;
    otherOrgId = (
        await prisma.organization.create({
            data: { name: "Elsewhere", slug: `so-else-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    hill = await storefront(orgId, "Hill Road");
    online = await storefront(orgId, "Online");
    otherStore = await storefront(otherOrgId, "Their Shop");
    for (const storeId of [hill, online]) {
        customer[storeId] = (
            await prisma.customer.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    email: `so-buyer-${tag}@example.com`,
                    firstName: "Asha",
                },
            })
        ).id;
    }
    otherProduct = (
        await prisma.product.create({
            data: {
                storeId: otherStore,
                organizationId: otherOrgId,
                name: "Their jam",
                slug: `so-theirs-${tag}`,
                price: "100.00",
                stockTracked: false,
            },
        })
    ).id;
    await prisma.productListing.create({
        data: {
            storeId: otherStore,
            organizationId: otherOrgId,
            productId: otherProduct,
        },
    });
});

afterEach(async () => {
    await prisma.businessProfile.updateMany({
        where: { organizationId: orgId },
        data: { stockTracking: true },
    });
});

/** A product listed at both storefronts; untracked unless a count is given. */
async function product(
    name: string,
    opts: { tracked?: number } = {},
): Promise<string> {
    seq += 1;
    const p = await prisma.product.create({
        data: {
            storeId: hill,
            organizationId: orgId,
            name,
            slug: `so-${seq}-${tag}`,
            price: "100.00",
            stockTracked: opts.tracked !== undefined,
        },
    });
    for (const storeId of [hill, online]) {
        await prisma.productListing.create({
            data: { storeId, organizationId: orgId, productId: p.id },
        });
        if (opts.tracked !== undefined) {
            await prisma.$transaction((tx) =>
                count(
                    tx,
                    { organizationId: orgId, userId: ownerId },
                    {
                        target: { storeId, productId: p.id },
                        counted: opts.tracked ?? 0,
                    },
                ),
            );
        }
    }
    return p.id;
}

const mark = (
    ctx: OrganizationContext,
    productId: string,
    storefrontId: string,
    value = true,
) => soldOut.set(ctx, productId, storefrontId, value);

async function place(storeId: string, productId: string, quantity = 1) {
    return (
        await orders.create(storeId, ownerId, {
            customerId: customer[storeId],
            items: [{ productId, quantity }],
        })
    ).id;
}

const listing = (storeId: string, productId: string) =>
    prisma.productListing.findUniqueOrThrow({
        where: { storeId_productId: { storeId, productId } },
        select: { soldOutAt: true, soldOutByUserId: true },
    });

const auditRows = (productId: string) =>
    prisma.auditEvent.findMany({
        where: { organizationId: orgId, targetId: productId },
        orderBy: { createdAt: "asc" },
        select: {
            action: true,
            actorUserId: true,
            targetType: true,
            metadata: true,
        },
    });

describe("marking an untracked product Sold out by hand", () => {
    it("refuses new staff orders at that storefront only, in a counted Sold out's words, until marked available", async () => {
        const cake = await product("Made-to-order cake");
        // Untracked, it sells without a count.
        await place(hill, cake, 50);

        const result = await mark(owner(), cake, hill);
        expect(result).toEqual({
            productId: cake,
            storefrontId: hill,
            name: "Hill Road",
            soldOut: true,
        });
        expect(await listing(hill, cake)).toMatchObject({
            soldOutByUserId: ownerId,
        });
        expect((await listing(hill, cake)).soldOutAt).not.toBeNull();

        const refused = place(hill, cake);
        await expect(refused).rejects.toThrow(ConflictException);
        await expect(place(hill, cake)).rejects.toThrow(
            "Made-to-order cake — Sold out",
        );
        const error = await place(hill, cake).catch((e: unknown) => e);
        expect(
            (error as ConflictException).getResponse() as {
                details: { reason: string; storefront: string };
            },
        ).toMatchObject({
            details: {
                reason: "SOLD_OUT",
                storefront: "Hill Road",
                available: 0,
            },
        });

        // Another storefront still sells it.
        await place(online, cake);

        // No stock entry is written.
        expect(
            await prisma.stockEntry.count({ where: { productId: cake } }),
        ).toBe(0);

        await mark(owner(), cake, hill, false);
        expect(await listing(hill, cake)).toEqual({
            soldOutAt: null,
            soldOutByUserId: null,
        });
        await place(hill, cake, 3);
    });

    it("leaves open orders alone: an order placed before can still be fulfilled", async () => {
        const bread = await product("Rye loaf");
        const open = await place(hill, bread, 2);
        await mark(owner(), bread, hill);
        await orders.updateStatus(hill, open, ownerId, {
            status: "PROCESSING",
        });
        await orders.updateStatus(hill, open, ownerId, {
            status: "DELIVERED",
        });
        expect(
            await prisma.order.findUniqueOrThrow({
                where: { id: open },
                select: { status: true },
            }),
        ).toEqual({ status: "DELIVERED" });
    });

    it("refuses a paid online checkout there, and records its automatic refund", async () => {
        const candle = await product("Hand-poured candle");
        await mark(owner(), candle, online);
        const order = await prisma.order.create({
            data: {
                storeId: online,
                organizationId: orgId,
                customerId: customer[online],
                orderId: `WEB-${Math.random().toString(36).slice(2, 8)}`,
                currency: "INR",
                subtotal: "100.00",
                total: "100.00",
                items: {
                    create: [
                        { productId: candle, quantity: 1, price: "100.00" },
                    ],
                },
            },
        });
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: orgId,
                orderId: order.id,
                provider: "RAZORPAY",
                providerIntentId: `prov_${order.id}`,
                amountCents: 10000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        const result = await prisma.$transaction((tx) =>
            reserveOnPayment(tx, {
                organizationId: orgId,
                orderId: order.id,
                paymentIntentId: intent.id,
            }),
        );
        expect(result).toMatchObject({
            kind: "REFUSED",
            created: true,
            message: SOLD_OUT_WHILE_PAYING,
            refusal: {
                productId: candle,
                available: 0,
                storefront: "Online",
                message: "Hand-poured candle — Sold out",
            },
        });
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntentId: intent.id, status: "PENDING" },
            }),
        ).toBe(1);
    });

    it("is idempotent: marking twice changes nothing and records one audit row", async () => {
        const jam = await product("Plum jam");
        await mark(owner(), jam, hill);
        const first = await listing(hill, jam);
        await mark(owner(), jam, hill);
        expect(await listing(hill, jam)).toEqual(first);
        await mark(owner(), jam, hill, false);
        await mark(owner(), jam, hill, false);

        const rows = await auditRows(jam);
        expect(rows).toEqual([
            {
                action: "product.sold-out.mark",
                actorUserId: ownerId,
                targetType: "product",
                metadata: {
                    product: "Plum jam",
                    storefront: "Hill Road",
                    storefrontId: hill,
                },
            },
            {
                action: "product.sold-out.clear",
                actorUserId: ownerId,
                targetType: "product",
                metadata: {
                    product: "Plum jam",
                    storefront: "Hill Road",
                    storefrontId: hill,
                },
            },
        ]);
    });

    it("works through the storefront-route alias", async () => {
        const soap = await product("Olive soap");
        await expect(
            soldOut.setViaStore(online, soap, ownerId, true),
        ).resolves.toMatchObject({ storefrontId: online, soldOut: true });
        expect((await listing(online, soap)).soldOutAt).not.toBeNull();
        expect((await listing(hill, soap)).soldOutAt).toBeNull();
    });
});

describe("who may mark it, and what", () => {
    it("a stock-only role may; a Member with neither inventory:write nor store:write is refused", async () => {
        const tea = await product("Loose tea");
        await expect(mark(clerk(), tea, hill)).resolves.toMatchObject({
            soldOut: true,
        });
        await expect(mark(member(), tea, hill, false)).rejects.toThrow(
            ForbiddenException,
        );
        expect((await listing(hill, tea)).soldOutAt).not.toBeNull();
    });

    it("refuses a product that counts stock (409)", async () => {
        const counted = await product("Counted mug", { tracked: 4 });
        await expect(mark(owner(), counted, hill)).rejects.toThrow(
            ConflictException,
        );
        await expect(mark(owner(), counted, hill)).rejects.toThrow(
            SOLD_OUT_NEEDS_UNTRACKED,
        );
        expect((await listing(hill, counted)).soldOutAt).toBeNull();
    });

    it("another business's product or storefront is not found", async () => {
        const ours = await product("Our jam");
        await expect(mark(owner(), otherProduct, otherStore)).rejects.toThrow(
            NotFoundException,
        );
        await expect(mark(owner(), otherProduct, hill)).rejects.toThrow(
            NotFoundException,
        );
        await expect(mark(owner(), ours, otherStore)).rejects.toThrow(
            NotFoundException,
        );
        const theirs = await prisma.productListing.findFirstOrThrow({
            where: { productId: otherProduct },
            select: { soldOutAt: true },
        });
        expect(theirs.soldOutAt).toBeNull();
    });

    it("a storefront that doesn't sell it is not found", async () => {
        const only = await product("Hill-only pie");
        await prisma.productListing.delete({
            where: { storeId_productId: { storeId: online, productId: only } },
        });
        await expect(mark(owner(), only, online)).rejects.toThrow(
            NotFoundException,
        );
    });
});

describe("turning tracking on clears it", () => {
    it("the product's own switch clears it at every storefront", async () => {
        const honey = await product("Honey");
        await mark(owner(), honey, hill);
        await mark(owner(), honey, online);
        await inventory.setTrackingIn(
            await access.write(owner(), honey),
            honey,
            true,
        );
        expect((await listing(hill, honey)).soldOutAt).toBeNull();
        expect((await listing(online, honey)).soldOutAt).toBeNull();
    });

    it("the business's switch clears it for products whose own switch is on, and keeps the rest", async () => {
        const counts = await product("Counts again", { tracked: 2 });
        const own = await product("Own switch off");
        await business.set(owner(), false);
        // With the business off, a product that counted is untracked too.
        await mark(owner(), counts, hill);
        await mark(owner(), own, hill);

        await business.set(owner(), true);
        expect((await listing(hill, counts)).soldOutAt).toBeNull();
        expect((await listing(hill, own)).soldOutAt).not.toBeNull();
    });
});

describe("reads say where it is sold out", () => {
    it("the product, the storefront's list, the catalogue and the stock levels", async () => {
        const pie = await product("Apple pie");
        await mark(owner(), pie, online);

        const atOnline = await products.getIn(
            await access.read(owner(), pie, online),
            pie,
        );
        expect(atOnline.soldOut).toBe(true);
        expect(atOnline.storefronts).toEqual([
            { storefrontId: hill, name: "Hill Road", soldOut: false },
            { storefrontId: online, name: "Online", soldOut: true },
        ]);
        const atHill = await products.getIn(
            await access.read(owner(), pie, hill),
            pie,
        );
        expect(atHill.soldOut).toBe(false);

        const onlineList = await products.listIn(
            await access.read(owner(), undefined, online),
        );
        expect(onlineList.find((p) => p.id === pie)?.soldOut).toBe(true);
        const hillList = await products.listIn(
            await access.read(owner(), undefined, hill),
        );
        expect(hillList.find((p) => p.id === pie)?.soldOut).toBe(false);

        const catalogue = await products.catalogue(orgId);
        const row = catalogue.find((p) => p.id === pie);
        expect(row?.soldOut).toBe(false);
        expect(row?.listings.map((l) => [l.storeName, l.soldOut])).toEqual([
            ["Hill Road", false],
            ["Online", true],
        ]);
        const filtered = await products.catalogue(orgId, {
            storefront: online,
        });
        expect(filtered.find((p) => p.id === pie)?.soldOut).toBe(true);

        const levels = await reads.levels(owner(), { product: pie });
        expect(levels.untracked).toEqual([
            expect.objectContaining({ productId: pie, soldOutAt: [online] }),
        ]);
    });
});
