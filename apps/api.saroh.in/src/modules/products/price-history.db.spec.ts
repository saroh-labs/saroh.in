/**
 * Price history (the owner, 12 Oct 2026), against a real Postgres: a change
 * to what something costs is kept where it is made, with who made it and
 * the value before and after, and the item's own read gives it back newest
 * first.
 *
 * - A product's section save, an option's save, a service's save and an
 *   imported row each leave one entry, in the same transaction as the
 *   change.
 * - A save that moves nothing about the cost leaves none, and a refused
 *   one leaves none.
 * - The rates sheet leaves one entry, never two.
 * - Another business reads none of it.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { PriceHistoryEntry } from "../audit/price-history";
import { BookingsService } from "../bookings/bookings.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ImportsService } from "../imports/imports.service";
import { GstRatesService } from "../invoices/gst-rates.service";
import { StoresService } from "../stores/stores.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const variants = new VariantsService(products);
const bookings = new BookingsService();
const imports = new ImportsService(stores);
const rates = new GstRatesService();

/** Rye & Co: GST-registered in Karnataka, prices include GST. */
let owner: OrganizationContext;
let rival: OrganizationContext;
let ownerId = "";
let storeId = "";
/** ₹780 at 5%, no MRP. */
let loaf = "";

/**
 * Put every entry written so far a minute further into the past, so the
 * next one is strictly newer than all of them. The read orders by time,
 * and two saves a test makes back to back can land in the same
 * millisecond: this keeps "newest first" exact without waiting on a clock.
 */
const settle = () =>
    prisma.$executeRaw`UPDATE "AuditEvent" SET "createdAt" = "createdAt" - interval '1 minute' WHERE "organizationId" = ${owner.organizationId}`;

/** The item's history as the page reads it, without ids and times. */
const said = (entries: PriceHistoryEntry[]) =>
    entries.map((e) => ({
        first: e.first,
        who: e.who,
        option: e.option,
        source: e.source,
        changes: e.changes,
    }));

const productHistory = async (id: string) =>
    (await products.priceHistory(owner.organizationId, id)).entries;

/** Every price entry the business has for one target, straight off the stream. */
const rows = (targetType: string, targetId: string) =>
    prisma.auditEvent.findMany({
        where: {
            organizationId: owner.organizationId,
            targetType,
            targetId,
            action: { in: ["price.set", "price.changed", "gst-rate.set"] },
        },
        orderBy: { createdAt: "asc" },
    });

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `price-history-${tag}@example.com`, name: "Asha" },
        })
    ).id;
    const [org, other] = await Promise.all([
        prisma.organization.create({
            data: { name: "Rye & Co", slug: `price-history-${tag}` },
        }),
        prisma.organization.create({
            data: { name: "Another bakery", slug: `price-history-b-${tag}` },
        }),
    ]);
    await prisma.membership.create({
        data: { organizationId: org.id, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId: ownerId, role: "OWNER" };
    rival = { organizationId: other.id, userId: ownerId, role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            taxId: "29AAGCR4375J1ZU",
            gstRegistered: true,
            gstState: "29",
            invoicePrefix: "RC",
            timezone: "UTC",
            addressLine1: "14 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
        },
    });
    storeId = (
        await stores.createForUser(ownerId, org.id, {
            name: "Hill Road",
            slug: `price-history-store-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
    });
    loaf = (
        await products.create(storeId, ownerId, {
            name: "Rye loaf",
            price: "780",
            gstRate: "5",
        })
    ).id;
});

describe("a product (real database)", () => {
    it("starts its history when it is made, by who made it", async () => {
        expect(said(await productHistory(loaf))).toEqual([
            {
                first: true,
                who: { name: "Asha" },
                option: null,
                source: "editor",
                changes: [
                    { field: "price", before: null, after: "780.00" },
                    { field: "gstRate", before: null, after: "5" },
                ],
            },
        ]);
    });

    it("a section save leaves one entry with the value before and after, newest first", async () => {
        await settle();
        await products.patch(storeId, loaf, ownerId, {
            price: "820",
            mrp: "1000",
        });
        const history = await productHistory(loaf);
        expect(said(history)).toEqual([
            {
                first: false,
                who: { name: "Asha" },
                option: null,
                source: "editor",
                changes: [
                    { field: "price", before: "780.00", after: "820.00" },
                    { field: "mrp", before: null, after: "1000.00" },
                ],
            },
            expect.objectContaining({ first: true }),
        ]);
        // What the stream holds: the item, its name and what it is priced in.
        const [, changed] = await rows("product", loaf);
        expect(changed).toMatchObject({
            action: "price.changed",
            actorUserId: ownerId,
            outcome: "SUCCESS",
            metadata: {
                kind: "PRODUCT",
                name: "Rye loaf",
                currency: "INR",
                source: "editor",
            },
        });
    });

    it("a save that moves nothing about the cost leaves none", async () => {
        const before = (await rows("product", loaf)).length;
        await products.patch(storeId, loaf, ownerId, {
            name: "Rye loaf, large",
        });
        await products.patch(storeId, loaf, ownerId, {
            price: "820.00",
            gstRate: "5",
        });
        expect(await rows("product", loaf)).toHaveLength(before);
    });

    it("a refused save leaves none, and the price stands", async () => {
        const before = (await rows("product", loaf)).length;
        // An MRP below the price it sells for.
        await expect(
            products.patch(storeId, loaf, ownerId, { mrp: "500" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(await rows("product", loaf)).toHaveLength(before);
        const stored = await prisma.product.findUniqueOrThrow({
            where: { id: loaf },
            select: { mrp: true },
        });
        expect(stored.mrp?.toString()).toBe("1000");
    });

    it("the rates sheet leaves one entry, never two", async () => {
        await settle();
        const before = (await rows("product", loaf)).length;
        await rates.set(owner, {
            items: [{ kind: "PRODUCT", id: loaf, rate: "18" }],
        });
        const after = await rows("product", loaf);
        expect(after).toHaveLength(before + 1);
        expect(after[after.length - 1]!.action).toBe("price.changed");
        expect(said(await productHistory(loaf))[0]).toEqual({
            first: false,
            who: { name: "Asha" },
            option: null,
            source: "rates",
            changes: [{ field: "gstRate", before: "5", after: "18" }],
        });
    });
});

describe("an option (real database)", () => {
    it("its price and MRP are kept on its product, by name", async () => {
        await settle();
        const large = (
            await variants.create(storeId, loaf, ownerId, {
                sku: `RL-L-${tag}`,
                title: "Large",
                price: "900",
            })
        ).id;
        await settle();
        await variants.update(storeId, loaf, large, ownerId, {
            sku: `RL-L-${tag}`,
            title: "Large",
            price: "950",
        });
        const [changed, made] = said(await productHistory(loaf));
        expect(changed).toEqual({
            first: false,
            who: { name: "Asha" },
            option: "Large",
            source: "editor",
            changes: [{ field: "price", before: "900.00", after: "950.00" }],
        });
        expect(made).toEqual({
            first: true,
            who: { name: "Asha" },
            option: "Large",
            source: "editor",
            changes: [{ field: "price", before: null, after: "900.00" }],
        });
        // A save that leaves its price alone keeps nothing.
        const before = (await rows("product", loaf)).length;
        await variants.update(storeId, loaf, large, ownerId, {
            sku: `RL-L-${tag}`,
            title: "Extra large",
            price: "950",
        });
        expect(await rows("product", loaf)).toHaveLength(before);
    });
});

describe("a service (real database)", () => {
    it("is kept when it is made and when its price or GST changes", async () => {
        const made = await bookings.createService(owner, {
            name: "Baking class",
            durationMinutes: 90,
            priceCents: 150_000,
            currency: "INR",
            timezone: "Asia/Kolkata",
        });
        await settle();
        await bookings.updateService(owner, made.id, {
            priceCents: 180_000,
            gstRate: "18",
            gstPriceMode: "ADDED",
        });
        // Nothing about the cost: no entry.
        await bookings.updateService(owner, made.id, { durationMinutes: 120 });
        const { entries } = await bookings.servicePriceHistory(owner, made.id);
        expect(said(entries)).toEqual([
            {
                first: false,
                who: { name: "Asha" },
                option: null,
                source: "editor",
                changes: [
                    { field: "price", before: "1500.00", after: "1800.00" },
                    { field: "gstRate", before: null, after: "18" },
                    { field: "gstPriceMode", before: null, after: "ADDED" },
                ],
            },
            {
                first: true,
                who: { name: "Asha" },
                option: null,
                source: "editor",
                changes: [{ field: "price", before: null, after: "1500.00" }],
            },
        ]);
        expect(await rows("service", made.id)).toHaveLength(2);
    });
});

describe("an import (real database)", () => {
    it("each row written leaves one entry, by whoever ran it", async () => {
        const slug = `plum-jam-${tag}`;
        const mapping = { name: "name", slug: "slug", price: "price" };
        await imports.apply(storeId, ownerId, "products", {
            csv: ["name,slug,price", `Plum jam,${slug},240`, ""].join("\n"),
            mapping,
            policy: "SKIP",
        });
        const jam = await prisma.product.findUniqueOrThrow({
            where: {
                organizationId_slug: {
                    organizationId: owner.organizationId,
                    slug,
                },
            },
            select: { id: true },
        });
        await settle();
        await imports.apply(storeId, ownerId, "products", {
            csv: ["name,slug,price", `Plum jam,${slug},260`, ""].join("\n"),
            mapping,
            policy: "UPDATE",
        });
        expect(said(await productHistory(jam.id))).toEqual([
            {
                first: false,
                who: { name: "Asha" },
                option: null,
                source: "import",
                changes: [
                    { field: "price", before: "240.00", after: "260.00" },
                ],
            },
            {
                first: true,
                who: { name: "Asha" },
                option: null,
                source: "import",
                changes: [{ field: "price", before: null, after: "240.00" }],
            },
        ]);
    });
});

describe("who reads it (real database)", () => {
    it("another business reads none of it", async () => {
        await expect(
            products.priceHistory(rival.organizationId, loaf),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("gives a page at a time, newest first, with where the next starts", async () => {
        const all = await productHistory(loaf);
        expect(all.length).toBeGreaterThan(2);
        const first = await products.priceHistory(owner.organizationId, loaf, {
            limit: 2,
        });
        expect(first.entries.map((e) => e.id)).toEqual(
            all.slice(0, 2).map((e) => e.id),
        );
        expect(first.nextCursor).toBe(all[1]!.id);
        const next = await products.priceHistory(owner.organizationId, loaf, {
            limit: 2,
            cursor: first.nextCursor ?? undefined,
        });
        expect(next.entries[0]!.id).toBe(all[2]!.id);
    });
});
