/**
 * The StockEntry.system backfill in migration 20261007100000 (#513, #515),
 * against a real Postgres: the migration's own UPDATE statements, read from
 * the file, mark the counts Saroh wrote before the column existed — and
 * leave a person's count alone even when its note reads the same.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";

import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

const MIGRATION = path.resolve(
    __dirname,
    "../../../../../packages/database/prisma/migrations/20261007100000_collection_product_position/migration.sql",
);

/** The migration's UPDATE statements, comments stripped. */
function backfillStatements(): string[] {
    const sql = readFileSync(MIGRATION, "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
    return sql
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter((s) => s.startsWith("UPDATE"));
}

const tag = `${process.pid}-${Date.now()}`;
const t0 = new Date(Date.UTC(2026, 8, 1, 10));
const later = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

let orgId = "";
let storeId = "";
let seq = 0;

beforeAll(async () => {
    orgId = (
        await prisma.organization.create({
            data: { name: "Backfill Co.", slug: `sb-${tag}` },
        })
    ).id;
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `sb-hill-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
});

async function product(variants: string[] = []) {
    seq += 1;
    return prisma.product.create({
        data: {
            organizationId: orgId,
            storeId,
            name: `Product ${seq}`,
            slug: `sb-${seq}-${tag}`,
            price: "10.00",
            variants: {
                create: variants.map((title) => ({
                    sku: `SB-${seq}-${title}-${tag}`,
                    title,
                })),
            },
        },
        include: { variants: true },
    });
}

async function shelf(productId: string, variantId: string | null = null) {
    return prisma.stockLevel.create({
        data: { organizationId: orgId, storeId, productId, variantId },
    });
}

/** A COUNTED entry: before → counted, with the rest as given. */
async function counted(
    row: { id: string; productId: string; variantId: string | null },
    input: {
        before: number;
        counted: number;
        note: string;
        at: Date;
        expected?: number | null;
    },
): Promise<string> {
    const data: Prisma.StockEntryUncheckedCreateInput = {
        organizationId: orgId,
        stockLevelId: row.id,
        storeId,
        productId: row.productId,
        variantId: row.variantId,
        kind: "COUNTED",
        quantity: input.counted - input.before,
        before: input.before,
        after: input.counted,
        counted: input.counted,
        expected: input.expected ?? null,
        note: input.note,
        createdAt: input.at,
    };
    return (await prisma.stockEntry.create({ data })).id;
}

async function systemOf(ids: string[]) {
    const rows = await prisma.stockEntry.findMany({
        where: { id: { in: ids } },
        select: { id: true, system: true },
    });
    const by = new Map(rows.map((r) => [r.id, r.system]));
    return ids.map((id) => by.get(id) ?? null);
}

it("marks Saroh's counts by note and shape, and never a person's count with the same note", async () => {
    // Track stock turned off: 4 counted to 0.
    const bread = await product();
    const breadRow = await shelf(bread.id);
    const offBySaroh = await counted(breadRow, {
        before: 4,
        counted: 0,
        note: "Track stock turned off",
        at: t0,
    });
    // A person counting to 0, shown 3, with that note.
    const offByPerson = await counted(breadRow, {
        before: 0,
        counted: 0,
        note: "Track stock turned off",
        expected: 3,
        at: later(60),
    });

    // The per-variant switch: each variant's shelf counted first, then the
    // product's own shelf, within a moment.
    const dress = await product(["S", "M"]);
    const [small, medium] = dress.variants;
    const own = await shelf(dress.id);
    await counted(own, {
        before: 0,
        counted: 5,
        note: "Opening count",
        at: later(-3600),
    });
    const sRow = await shelf(dress.id, small.id);
    const mRow = await shelf(dress.id, medium.id);
    const switchS = await counted(sRow, {
        before: 0,
        counted: 3,
        note: "Now counted per variant",
        at: later(1),
    });
    const switchM = await counted(mRow, {
        before: 0,
        counted: 2,
        note: "Now counted per variant",
        at: later(1.02),
    });
    const switchOwn = await counted(own, {
        before: 5,
        counted: 0,
        note: "Now counted per variant",
        at: later(1.05),
    });
    // An hour on, a person types the same note on M's shelf.
    const personOnM = await counted(mRow, {
        before: 2,
        counted: 2,
        note: "Now counted per variant",
        at: later(3600),
    });

    // A removed variant's stock back on the product's shelf: "Blue" is gone.
    const kurta = await product(["Red"]);
    const kurtaRow = await shelf(kurta.id);
    const takenBack = await counted(kurtaRow, {
        before: 0,
        counted: 6,
        note: "Took back Blue's stock",
        at: later(10),
    });
    // A person's note naming a variant the product still has.
    const personRed = await counted(kurtaRow, {
        before: 6,
        counted: 8,
        note: "Took back Red's stock",
        at: later(20),
    });
    // A person's return note, shown what was there.
    const personPriya = await counted(kurtaRow, {
        before: 8,
        counted: 9,
        note: "Took back Priya's stock",
        expected: 8,
        at: later(30),
    });

    const statements = backfillStatements();
    expect(statements).toHaveLength(3);
    for (const sql of statements) await prisma.$executeRawUnsafe(sql);

    expect(
        await systemOf([
            offBySaroh,
            offByPerson,
            switchS,
            switchM,
            switchOwn,
            personOnM,
            takenBack,
            personRed,
            personPriya,
        ]),
    ).toEqual([
        "TRACKING_OFF",
        null,
        "PER_VARIANT",
        "PER_VARIANT",
        "PER_VARIANT",
        null,
        "VARIANT_REMOVED",
        null,
        null,
    ]);
});
