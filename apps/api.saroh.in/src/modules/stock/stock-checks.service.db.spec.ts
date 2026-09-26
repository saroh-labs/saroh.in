import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { ProductAccess } from "../products/product-access";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { StockChecksService } from "./stock-checks.service";
import { count } from "./stock.service";

/**
 * Stock checks (#514), against a real database: each kind appears when its
 * numbers say so, a resolved one stays hidden while they still say the same,
 * and nothing of another business is found.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Stock checks (DB)", () => {
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const access = new ProductAccess(stores);
    const products = new ProductsService(stores, undefined, access);
    const checks = new StockChecksService(new IdempotencyService());

    const users: Record<string, string> = {};
    let orgId = "";
    let hill = "";
    let otherOrgId = "";
    let otherStore = "";
    let customerId = "";

    const owner = (): OrganizationContext => ({
        organizationId: orgId,
        userId: users.OWNER,
        role: "OWNER",
    });

    async function storefront(organizationId: string, name: string) {
        return (
            await prisma.store.create({
                data: {
                    name,
                    slug: `sc-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId,
                },
            })
        ).id;
    }

    async function product(name: string, onHand: number | null) {
        const scope = await access.write(owner(), undefined, hill);
        const { id } = await products.createIn(scope, { name, price: "40" });
        if (onHand !== null) await track(id, onHand);
        return id;
    }

    /** Start counting at Hill Road (as Track stock will), at `onHand`. */
    async function track(productId: string, onHand: number) {
        const { shelf } = await prisma.$transaction((t) =>
            count(
                t,
                { organizationId: orgId, userId: users.OWNER },
                { target: { storeId: hill, productId }, counted: onHand },
            ),
        );
        return shelf.stockLevelId;
    }

    async function order(
        status: string,
        line: {
            productId: string;
            quantity: number;
            stockRow?: "PRODUCT" | "NONE" | null;
            stockLevelId?: string | null;
            heldQuantity?: number;
        },
    ) {
        return prisma.order.create({
            data: {
                storeId: hill,
                organizationId: orgId,
                orderId: `SC-${Math.random().toString(36).slice(2, 8)}`,
                customerId,
                subtotal: "0",
                total: "0",
                status,
                items: {
                    create: {
                        productId: line.productId,
                        quantity: line.quantity,
                        price: "40",
                        stockRow: line.stockRow ?? null,
                        stockLevelId: line.stockLevelId ?? null,
                        heldQuantity: line.heldQuantity ?? 0,
                    },
                },
            },
            include: { items: true },
        });
    }

    beforeAll(async () => {
        for (const who of ["OWNER", "READER", "STRANGER"]) {
            users[who] = (
                await prisma.user.create({
                    data: {
                        email: `sc-${who.toLowerCase()}-${tag}@example.com`,
                    },
                })
            ).id;
        }
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `sc-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `sc-else-${tag}` },
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: users.OWNER, role: "OWNER" },
        });
        hill = await storefront(orgId, "Hill Road");
        otherStore = await storefront(otherOrgId, "Elsewhere");
        customerId = (
            await prisma.customer.create({
                data: { storeId: hill, email: `sc-buyer-${tag}@example.com` },
            })
        ).id;
    });

    it("a shelf holding less than it promised is short", async () => {
        const id = await product("Croissant", 3);
        const stockLevelId = (
            await prisma.stockLevel.findFirstOrThrow({
                where: { productId: id },
            })
        ).id;
        await order("PENDING", {
            productId: id,
            quantity: 5,
            stockRow: "PRODUCT",
            stockLevelId,
            heldQuantity: 5,
        });
        await prisma.stockLevel.update({
            where: { id: stockLevelId },
            data: { promised: 5 },
        });

        const view = await checks.list(owner());
        const short = view.checks.find(
            (c) => c.key === `short:${stockLevelId}`,
        );
        expect(short).toMatchObject({
            kind: "SHORT",
            title: "2 short",
            storeName: "Hill Road",
            productName: "Croissant",
            numbers: { onHand: 3, promised: 5, short: 2 },
        });
        // Promised matches what the open line holds: no promise check.
        expect(
            view.checks.some((c) => c.key === `promised:${stockLevelId}`),
        ).toBe(false);
    });

    it("promised that isn't what open lines hold is flagged", async () => {
        const id = await product("Danish", 10);
        const stockLevelId = (
            await prisma.stockLevel.findFirstOrThrow({
                where: { productId: id },
            })
        ).id;
        await prisma.stockLevel.update({
            where: { id: stockLevelId },
            data: { promised: 3 },
        });
        const view = await checks.list(owner());
        expect(
            view.checks.find((c) => c.key === `promised:${stockLevelId}`),
        ).toMatchObject({
            kind: "PROMISED_MISMATCH",
            numbers: { promised: 3, held: 0 },
        });
        expect(view.counts.PROMISED_MISMATCH).toBeGreaterThan(0);
    });

    it("a count against a shelf that moved didn't match, until it is undone", async () => {
        const id = await product("Focaccia", 9);
        const { entry } = await prisma.$transaction((t) =>
            count(
                t,
                { organizationId: orgId, userId: users.OWNER },
                {
                    target: { storeId: hill, productId: id },
                    expected: 10,
                    counted: 7,
                },
            ),
        );
        const view = await checks.list(owner());
        expect(
            view.checks.find((c) => c.key === `count:${entry.id}`),
        ).toMatchObject({
            kind: "COUNT_MISMATCH",
            title: "Count didn't match",
            entryId: entry.id,
            numbers: { expected: 10, before: 9, counted: 7 },
        });
    });

    it("a line sold while untracked, fulfilled after counting began, wasn't taken from stock", async () => {
        const id = await product("Gift box", null);
        // Placed while the product counted nothing: it holds no shelf.
        const placed = await order("PENDING", {
            productId: id,
            quantity: 2,
            stockRow: "NONE",
        });
        await track(id, 6);
        await prisma.order.update({
            where: { id: placed.id },
            data: { status: "DELIVERED" },
        });

        const view = await checks.list(owner());
        const check = view.checks.find(
            (c) => c.key === `sale:${placed.items[0].id}`,
        );
        expect(check).toMatchObject({
            kind: "SALE_NOT_TAKEN",
            title: "Sale not taken from stock",
            numbers: { quantity: 2 },
            order: { id: placed.id, number: placed.orderId },
        });

        // A role without order:read sees the check, not the order.
        const reader: OrganizationContext = {
            organizationId: orgId,
            userId: users.READER,
            role: "MEMBER",
            roleKey: "custom",
            actions: resolveCapabilities("custom", ["store:read"]),
        };
        const asReader = await checks.list(reader);
        const theirs = asReader.checks.find((c) => c.key === check?.key);
        expect(theirs?.order).toBeNull();
        expect(theirs?.detail).toMatch(/^An order sold 2/);
        expect(asReader.canResolve).toBe(false);
        await expect(
            checks.resolve(reader, check?.key ?? "", {}),
        ).rejects.toThrow(ForbiddenException);
    });

    it("a sale made before the product counted stock is not a check", async () => {
        const id = await product("Hamper", null);
        const sold = await order("DELIVERED", {
            productId: id,
            quantity: 1,
            stockRow: "NONE",
        });
        await track(id, 4);
        const view = await checks.list(owner());
        expect(
            view.checks.some((c) => c.key === `sale:${sold.items[0].id}`),
        ).toBe(false);
    });

    it("resolving hides a check while its numbers hold, and it opens again when they move", async () => {
        const id = await product("Bun", 1);
        const stockLevelId = (
            await prisma.stockLevel.findFirstOrThrow({
                where: { productId: id },
            })
        ).id;
        await prisma.stockLevel.update({
            where: { id: stockLevelId },
            data: { promised: 4 },
        });
        const key = `short:${stockLevelId}`;
        const resolved = await checks.resolve(owner(), key, {
            note: "Baking more",
            idempotencyKey: `resolve-${tag}`,
        });
        expect(resolved).toMatchObject({ key, kind: "SHORT" });
        // The same tap again replays.
        await checks.resolve(owner(), key, {
            note: "Baking more",
            idempotencyKey: `resolve-${tag}`,
        });
        expect(
            await prisma.stockCheckResolution.count({ where: { key } }),
        ).toBe(1);
        expect(
            (await checks.list(owner())).checks.some((c) => c.key === key),
        ).toBe(false);

        await prisma.stockLevel.update({
            where: { id: stockLevelId },
            data: { promised: 6 },
        });
        expect(
            (await checks.list(owner())).checks.find((c) => c.key === key),
        ).toMatchObject({ title: "5 short" });
    });

    it("a key that names nothing open, or another business's shelf, is not found", async () => {
        await expect(
            checks.resolve(owner(), "short:nothing", {}),
        ).rejects.toThrow(NotFoundException);
        const scope = await access.write(
            {
                organizationId: otherOrgId,
                userId: users.STRANGER,
                role: "OWNER",
            },
            undefined,
            otherStore,
        );
        const { id } = await products.createIn(scope, {
            name: "Theirs",
            price: "1",
        });
        const { shelf } = await prisma.$transaction((t) =>
            count(
                t,
                { organizationId: otherOrgId, userId: users.STRANGER },
                { target: { storeId: otherStore, productId: id }, counted: 0 },
            ),
        );
        await prisma.stockLevel.update({
            where: { id: shelf.stockLevelId },
            data: { promised: 2 },
        });
        const key = `short:${shelf.stockLevelId}`;
        expect(
            (await checks.list(owner())).checks.some((c) => c.key === key),
        ).toBe(false);
        await expect(checks.resolve(owner(), key, {})).rejects.toThrow(
            NotFoundException,
        );
    });
    it("pages the open checks, with the counts across every page", async () => {
        const all = await checks.list(owner());
        expect(all.nextCursor).toBeNull();
        expect(all.checks.length).toBeGreaterThan(1);
        const first = await checks.list(owner(), { limit: 1 });
        expect(first.checks.map((c) => c.key)).toEqual([all.checks[0].key]);
        expect(first.counts).toEqual(all.counts);
        expect(first.nextCursor).toBe(all.checks[0].key);
        const keys = [...first.checks.map((c) => c.key)];
        let cursor = first.nextCursor;
        while (cursor) {
            const page = await checks.list(owner(), { limit: 1, cursor });
            keys.push(...page.checks.map((c) => c.key));
            cursor = page.nextCursor;
        }
        expect(keys).toEqual(all.checks.map((c) => c.key));
        expect(first.restarted).toBe(false);
    });

    it("says it started again when the check a page ended on has closed", async () => {
        const first = await checks.list(owner(), { limit: 1 });
        const ended = first.nextCursor;
        expect(ended).not.toBeNull();
        // Someone looks at it before Show more is pressed.
        await checks.resolve(owner(), ended ?? "", {});
        const next = await checks.list(owner(), {
            limit: 1,
            cursor: ended ?? "",
        });
        expect(next.restarted).toBe(true);
        const fresh = await checks.list(owner(), { limit: 1 });
        expect(next.checks.map((c) => c.key)).toEqual(
            fresh.checks.map((c) => c.key),
        );
        expect(next.checks.map((c) => c.key)).not.toContain(ended);
    });
});
