/**
 * #530 backfill — the same product, made at two storefronts, becomes one
 * (ADR-010).
 *
 * Before #510 a product belonged to one storefront, so a business selling
 * the same shirt at Hill Road and online made it twice. The listings
 * backfill (`listings-stock-levels.ts`) gave each its own listing and shelf;
 * this one joins the pairs that are clearly the same into one catalogue
 * product, listed at both storefronts, each shelf keeping its numbers.
 *
 * Clearly the same, within one business only:
 * - the same name (trimmed, any case) and the same option;
 * - the same full set of variant SKUs, and per SKU the same price and MRP
 *   (the product's own price and MRP too, and the currency);
 * - the same GST rate and HSN code;
 * - the same tracking (no stock, counted as a whole, counted per variant);
 * - the same status — an archived twin joined to a live one would put it
 *   back on sale where it had been taken off.
 * Products without variants never merge: a name is all they share.
 *
 * The oldest survives; the others' variants map to its variants by SKU.
 * Everything that named a product that goes is re-pointed first — see
 * `merge-same-products.move.ts` — and the run stops if anything is left
 * that its removal would cascade away.
 *
 * A group stays apart when joining it would widen a live discount code's
 * reach: a code naming some of the group but not all, or a category code
 * covering one's category when their categories differ.
 *
 * Everything not merged, and every value a merge threw away, goes into the
 * business's merge report: one entry in the audit stream (read by Owner and
 * Admin through `GET /organizations/:id/catalogue/merge-report`) and one
 * notice in the Owner/Admin inbox saying what happened, so it is seen.
 *
 * Idempotent: a second run finds nothing to merge and writes no second
 * report. Each business runs in its own transaction. Run it after the
 * listings backfill; it refuses to run before it.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/merge-same-products.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

import type { TransactionClient } from "../transaction";
import { mergeProductInto, type Discarded } from "./merge-same-products.move";

/** The audit action the report is written under, and the notice's type. */
export const MERGE_REPORT_ACTION = "catalogue.products.merged";
export const MERGE_REPORT_NOTICE = "catalogue.merge-report";
export const MERGE_REPORT_ACTOR = "system:merge-same-products";

export type KeptApartReason =
    | "no-variants"
    | "different-option"
    | "different-variants"
    | "different-prices"
    | "different-tax"
    | "different-tracking"
    | "different-status"
    | "live-discount";

export interface OrganizationMergeReport {
    organizationId: string;
    merged: {
        name: string;
        /** The product that stays: the oldest. */
        productId: string;
        slug: string;
        /** The products joined into it, and the addresses that went. */
        from: { productId: string; slug: string }[];
    }[];
    /** Products that share a name with another but stay their own. */
    keptApart: {
        name: string;
        productId: string;
        /** The product it looks like. */
        apartFrom: string;
        reason: KeptApartReason;
    }[];
    discarded: Discarded[];
}

export interface MergeSameProductsReport {
    /** Businesses looked at. */
    organizations: number;
    /** Products joined into another and removed. */
    productsMerged: number;
    /** One per business with anything to say. */
    reports: OrganizationMergeReport[];
}

/** A product as the rule compares it. */
export interface Candidate {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    status: string;
    optionId: string | null;
    categoryId: string | null;
    currency: string;
    price: Money;
    mrp: Money | null;
    gstRate: Money | null;
    hsnCode: string | null;
    variants: {
        id: string;
        sku: string;
        price: Money | null;
        mrp: Money | null;
    }[];
    stockLevels: { variantId: string | null }[];
}

interface Money {
    toFixed(digits: number): string;
}

const key = (s: string) => s.trim().toLowerCase();
const money = (m: Money | null) => (m ? m.toFixed(2) : null);

/** How it counts stock: nowhere, as a whole, or per variant. */
function tracking(p: Candidate): string {
    if (p.stockLevels.length === 0) return "none";
    return p.stockLevels.some((r) => r.variantId) ? "variant" : "whole";
}

/** Per SKU, what it sells for: its own price, else the product's. */
function pricesBySku(p: Candidate): string {
    return JSON.stringify(
        [...p.variants]
            .sort((a, b) => a.sku.localeCompare(b.sku))
            .map((v) => [
                v.sku,
                money(v.price ?? p.price),
                money(v.mrp ?? p.mrp),
            ]),
    );
}

/**
 * The first rule two products fail, in the order the report explains it,
 * or null when they are clearly the same.
 */
export function whyApart(a: Candidate, b: Candidate): KeptApartReason | null {
    if (a.variants.length === 0 || b.variants.length === 0) {
        return "no-variants";
    }
    if (a.optionId !== b.optionId) return "different-option";
    const skus = (p: Candidate) =>
        JSON.stringify(p.variants.map((v) => v.sku).sort());
    if (skus(a) !== skus(b)) return "different-variants";
    if (
        a.currency !== b.currency ||
        money(a.price) !== money(b.price) ||
        money(a.mrp) !== money(b.mrp) ||
        pricesBySku(a) !== pricesBySku(b)
    ) {
        return "different-prices";
    }
    if (money(a.gstRate) !== money(b.gstRate) || a.hsnCode !== b.hsnCode) {
        return "different-tax";
    }
    if (tracking(a) !== tracking(b)) return "different-tracking";
    if (a.status !== b.status) return "different-status";
    return null;
}

const oldestFirst = (a: Candidate, b: Candidate) =>
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/** Split products sharing a name into groups that are clearly the same. */
export function clusters(products: Candidate[]): Candidate[][] {
    const out: Candidate[][] = [];
    for (const p of [...products].sort(oldestFirst)) {
        const home = out.find((c) => whyApart(c[0], p) === null);
        if (home) home.push(p);
        else out.push([p]);
    }
    return out;
}

export async function mergeSameProducts(
    db: PrismaClient,
    now: Date = new Date(),
): Promise<MergeSameProductsReport> {
    const report: MergeSameProductsReport = {
        organizations: 0,
        productsMerged: 0,
        reports: [],
    };
    await assertListingsBackfilled(db);

    const orgs = await db.organization.findMany({
        select: { id: true },
        orderBy: { id: "asc" },
    });
    for (const org of orgs) {
        report.organizations += 1;
        const one = await db.$transaction(
            (tx) => mergeOrganization(tx, org.id, now),
            { timeout: 120_000 },
        );
        report.productsMerged += one.merged.reduce(
            (n, m) => n + m.from.length,
            0,
        );
        if (
            one.merged.length > 0 ||
            one.keptApart.length > 0 ||
            one.discarded.length > 0
        ) {
            report.reports.push(one);
        }
    }
    return report;
}

/** Refuse to run on stock the listings backfill has not moved yet. */
async function assertListingsBackfilled(db: PrismaClient): Promise<void> {
    const [{ present }] = await db.$queryRaw<{ present: boolean }[]>`
        SELECT to_regclass('"StockLevel"') IS NOT NULL AS present`;
    if (!present) {
        throw new Error(
            "StockLevel does not exist yet. Run the migration 20261002100000_catalogue_listings_stock_levels and the listings backfill first.",
        );
    }
    const unmoved = await db.$queryRaw<{ id: string }[]>`
        SELECT p."id" FROM "Product" p
        WHERE (EXISTS (SELECT 1 FROM "Inventory" i WHERE i."productId" = p."id")
            OR EXISTS (SELECT 1 FROM "VariantInventory" v WHERE v."productId" = p."id"))
          AND NOT EXISTS (SELECT 1 FROM "StockLevel" s WHERE s."productId" = p."id")
        ORDER BY p."id" LIMIT 20`;
    if (unmoved.length > 0) {
        throw new Error(
            `Product(s) still count stock only in Inventory: ${unmoved
                .map((p) => p.id)
                .join(
                    ", ",
                )}. Run src/backfill/listings-stock-levels.cli.ts first.`,
        );
    }
}

async function mergeOrganization(
    tx: TransactionClient,
    organizationId: string,
    now: Date,
): Promise<OrganizationMergeReport> {
    const report: OrganizationMergeReport = {
        organizationId,
        merged: [],
        keptApart: [],
        discarded: [],
    };
    const products: Candidate[] = await tx.product.findMany({
        where: { organizationId },
        select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            status: true,
            optionId: true,
            categoryId: true,
            currency: true,
            price: true,
            mrp: true,
            gstRate: true,
            hsnCode: true,
            variants: {
                select: { id: true, sku: true, price: true, mrp: true },
            },
            stockLevels: { select: { variantId: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const byName = new Map<string, Candidate[]>();
    for (const p of products) {
        byName.set(key(p.name), [...(byName.get(key(p.name)) ?? []), p]);
    }

    for (const group of Array.from(byName.values())) {
        if (group.length < 2) continue;
        const remaining: { product: Candidate; reason?: KeptApartReason }[] =
            [];
        for (const cluster of clusters(group)) {
            const [survivor, ...losers] = cluster;
            if (
                losers.length > 0 &&
                !(await widensDiscount(tx, cluster, now))
            ) {
                for (const loser of losers) {
                    report.discarded.push(
                        ...(await mergeProductInto(tx, {
                            organizationId,
                            survivorId: survivor.id,
                            loserId: loser.id,
                        })),
                    );
                }
                report.merged.push({
                    name: survivor.name,
                    productId: survivor.id,
                    slug: survivor.slug,
                    from: losers.map((l) => ({
                        productId: l.id,
                        slug: l.slug,
                    })),
                });
                remaining.push({ product: survivor });
            } else {
                for (const p of cluster) {
                    remaining.push({
                        product: p,
                        reason: losers.length > 0 ? "live-discount" : undefined,
                    });
                }
            }
        }
        remaining.sort((a, b) => oldestFirst(a.product, b.product));
        const [first, ...rest] = remaining;
        for (const r of rest) {
            report.keptApart.push({
                name: r.product.name,
                productId: r.product.id,
                apartFrom: first.product.id,
                reason:
                    whyApart(first.product, r.product) ??
                    r.reason ??
                    "live-discount",
            });
        }
    }

    await writeReport(tx, report);
    return report;
}

/**
 * Would one product in place of these reach further under a live code? A
 * product code naming some of them but not all would then reach the others'
 * storefronts; a category code would reach a product whose category it did
 * not cover, when their categories differ.
 */
async function widensDiscount(
    tx: TransactionClient,
    cluster: Candidate[],
    now: Date,
): Promise<boolean> {
    const live = { OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
    const ids = cluster.map((p) => p.id);
    const named = await tx.discountProduct.findMany({
        where: { productId: { in: ids }, discount: live },
        select: { discountId: true, productId: true },
    });
    const reach = new Map<string, Set<string>>();
    for (const d of named) {
        reach.set(
            d.discountId,
            (reach.get(d.discountId) ?? new Set()).add(d.productId),
        );
    }
    if (Array.from(reach.values()).some((s) => s.size < ids.length)) {
        return true;
    }

    const categories = new Set(cluster.map((p) => p.categoryId));
    if (categories.size < 2) return false;
    const covered = await tx.discountCategory.count({
        where: {
            categoryId: {
                in: Array.from(categories).filter((c): c is string => !!c),
            },
            discount: live,
        },
    });
    return covered > 0;
}

/**
 * Write the report where Owner and Admin will see it: the full list in the
 * audit stream, and a notice in their inbox. Nothing merged, discarded or
 * newly kept apart since the last report: nothing written.
 */
async function writeReport(
    tx: TransactionClient,
    report: OrganizationMergeReport,
): Promise<void> {
    if (report.keptApart.length === 0 && report.merged.length === 0) return;
    if (report.merged.length === 0) {
        const earlier = await tx.auditEvent.count({
            where: {
                organizationId: report.organizationId,
                action: MERGE_REPORT_ACTION,
            },
        });
        if (earlier > 0) return;
    }
    await tx.auditEvent.create({
        data: {
            action: MERGE_REPORT_ACTION,
            actorUserId: MERGE_REPORT_ACTOR,
            organizationId: report.organizationId,
            targetType: "catalogue",
            outcome: "SUCCESS",
            metadata: JSON.parse(JSON.stringify(report)),
        },
    });
    await tx.notification.create({
        data: {
            organizationId: report.organizationId,
            type: MERGE_REPORT_NOTICE,
            ...noticeText(report),
        },
    });
}

const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

function names(list: { name: string }[]): string {
    const unique = Array.from(new Set(list.map((x) => x.name)));
    const shown = unique.slice(0, 3).join(", ");
    return unique.length > 3 ? `${shown} and ${unique.length - 3} more` : shown;
}

/** What the notice says: what joined, what did not, and what was dropped. */
export function noticeText(report: OrganizationMergeReport): {
    title: string;
    body: string;
} {
    const joined = report.merged.reduce((n, m) => n + m.from.length + 1, 0);
    const title =
        report.merged.length > 0
            ? `${plural(joined, "product", "products")} made at more than one storefront are now ${plural(report.merged.length, "product", "products")}`
            : "Some products share a name but were kept apart";
    const parts: string[] = [];
    if (report.merged.length > 0) {
        parts.push(
            `${names(report.merged)}: each is now one product, sold at every storefront that sold it, with each storefront's stock as it was.`,
        );
    }
    if (report.keptApart.length > 0) {
        parts.push(
            `${names(report.keptApart)} share a name with another product but differ in price, variants, tax, stock or a discount code, so they stay separate.`,
        );
    }
    const addresses = report.discarded.filter((d) => d.what === "address");
    const details = report.discarded.length - addresses.length;
    if (details > 0) {
        parts.push(
            `${plural(details, "detail", "details")} that differed kept the oldest product's value.`,
        );
    }
    if (addresses.length > 0) {
        parts.push(
            `Links to ${plural(addresses.length, "old product address", "old product addresses")} no longer open: ${addresses
                .slice(0, 3)
                .map((a) => a.value)
                .join(", ")}${addresses.length > 3 ? " and more" : ""}.`,
        );
    }
    return { title, body: parts.join(" ") };
}
