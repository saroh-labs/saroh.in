/**
 * The contract release's migration (B2d, DEC-045), run verbatim against a
 * real Postgres: `20261013100000_order_fulfilment_contract`.
 *
 * The integration database is built by `prisma db push` from the finished
 * schema, where COLLECT and DELIVERY no longer exist. So each test builds
 * the release-2 shape — the eight-value "OrderFulfilment" and the three
 * columns that hold it — in a schema of its own, points `search_path` at
 * it, and runs the migration file there as `migrate deploy` does: one
 * multi-statement script on one connection. Nothing in `public` is touched.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/** The part of node-postgres this spec uses (typed here: the api has no @types/pg). */
interface PgClient {
    connect(): Promise<void>;
    end(): Promise<void>;
    query<R = Record<string, unknown>>(sql: string): Promise<{ rows: R[] }>;
}

// `pg` is @saroh/database's dependency (the Prisma adapter's driver), not
// the api's; resolve it from there.
const { Client } = createRequire(require.resolve("@saroh/database"))("pg") as {
    Client: new (config: { connectionString: string }) => PgClient;
};

const MIGRATION = readFileSync(
    join(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20261013100000_order_fulfilment_contract/migration.sql",
    ),
    "utf8",
);

const UPDATED_AT = "2026-10-01 09:00:00";

/** Release 2's shape, cut down to what the migration reads and writes. */
const RELEASE_2 = `
CREATE TYPE "OrderFulfilment" AS ENUM ('COLLECT', 'DELIVERY', 'PICKUP',
    'LOCAL_DELIVERY', 'SHIPPING', 'DIGITAL', 'APPOINTMENT_IN_PERSON',
    'APPOINTMENT_ONLINE');
CREATE TABLE "Order" (
    "id" TEXT PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "fulfilment" "OrderFulfilment" NOT NULL DEFAULT 'PICKUP',
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Order_storeId_idx" ON "Order" ("storeId");
CREATE TABLE "StoreSettings" (
    "storeId" TEXT PRIMARY KEY,
    "fulfilmentTypes" "OrderFulfilment"[] DEFAULT ARRAY[]::"OrderFulfilment"[]
);
CREATE TABLE "Product" (
    "id" TEXT PRIMARY KEY,
    "fulfilmentTypes" "OrderFulfilment"[] DEFAULT ARRAY[]::"OrderFulfilment"[]
);
INSERT INTO "Order" ("id", "storeId", "stage", "fulfilment", "updatedAt") VALUES
    -- Stragglers: written by the release-1 image after B2c's backfill ran.
    ('late-collect', 's1', 'READY', 'COLLECT', '${UPDATED_AT}'),
    ('late-delivery', 's1', 'HANDED_TO_COURIER', 'DELIVERY', '${UPDATED_AT}'),
    -- Already in the types' own names.
    ('pickup', 's1', 'NEW', 'PICKUP', '${UPDATED_AT}'),
    ('local', 's1', 'HANDED_TO_COURIER', 'LOCAL_DELIVERY', '${UPDATED_AT}'),
    ('shipping', 's2', 'READY', 'SHIPPING', '${UPDATED_AT}'),
    ('digital', 's2', 'SENT', 'DIGITAL', '${UPDATED_AT}');
INSERT INTO "StoreSettings" ("storeId", "fulfilmentTypes") VALUES
    ('s1', '{PICKUP,SHIPPING}'),
    ('s2', '{SHIPPING,COLLECT,PICKUP}'),
    ('s3', '{}');
INSERT INTO "Product" ("id", "fulfilmentTypes") VALUES
    ('cake', '{PICKUP,LOCAL_DELIVERY}'),
    ('jar', '{DELIVERY,SHIPPING,LOCAL_DELIVERY}'),
    ('ebook', '{DIGITAL}'),
    ('candle', '{}');
`;

describe("the fulfilment contract migration (B2d, real database)", () => {
    let client: PgClient;
    let schema: string;

    async function rows<R>(sql: string): Promise<R[]> {
        return (await client.query<R>(sql)).rows;
    }

    const enumValues = () =>
        rows<{ v: string }>(
            `SELECT unnest(enum_range(NULL::"OrderFulfilment"))::text AS v`,
        ).then((r) => r.map((x) => x.v));

    const orders = () =>
        rows<{
            id: string;
            stage: string;
            fulfilment: string;
            updatedAt: string;
        }>(
            `SELECT "id", "stage", "fulfilment"::text AS "fulfilment",
                    to_char("updatedAt", 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt"
             FROM "Order" ORDER BY "id"`,
        );

    const arrays = (table: "StoreSettings" | "Product", key: string) =>
        rows<{ k: string; types: string[] }>(
            `SELECT "${key}" AS k, "fulfilmentTypes"::text[] AS types
             FROM "${table}" ORDER BY "${key}"`,
        ).then((r) => Object.fromEntries(r.map((x) => [x.k, x.types])));

    beforeEach(async () => {
        client = new Client({ connectionString: process.env.DATABASE_URL! });
        await client.connect();
        schema = `b2d_contract_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(RELEASE_2);
    });

    afterEach(async () => {
        // A failed script leaves its transaction open and aborted.
        await client.query("ROLLBACK").catch(() => undefined);
        await client.query(`SET search_path TO public`);
        await client.query(`DROP SCHEMA "${schema}" CASCADE`);
        await client.end();
    });

    it("converts the stragglers, then leaves the type with the six ways only", async () => {
        await client.query(MIGRATION);

        expect(await enumValues()).toEqual([
            "PICKUP",
            "LOCAL_DELIVERY",
            "SHIPPING",
            "DIGITAL",
            "APPOINTMENT_IN_PERSON",
            "APPOINTMENT_ONLINE",
        ]);
        // A COLLECT row the release-1 image wrote after B2c's backfill is
        // converted, not lost; nothing else about any order changes — not
        // its stage (a delivery with a courier keeps HANDED_TO_COURIER),
        // not when it last changed.
        expect(await orders()).toEqual([
            {
                id: "digital",
                stage: "SENT",
                fulfilment: "DIGITAL",
                updatedAt: UPDATED_AT,
            },
            {
                id: "late-collect",
                stage: "READY",
                fulfilment: "PICKUP",
                updatedAt: UPDATED_AT,
            },
            {
                id: "late-delivery",
                stage: "HANDED_TO_COURIER",
                fulfilment: "LOCAL_DELIVERY",
                updatedAt: UPDATED_AT,
            },
            {
                id: "local",
                stage: "HANDED_TO_COURIER",
                fulfilment: "LOCAL_DELIVERY",
                updatedAt: UPDATED_AT,
            },
            {
                id: "pickup",
                stage: "NEW",
                fulfilment: "PICKUP",
                updatedAt: UPDATED_AT,
            },
            {
                id: "shipping",
                stage: "READY",
                fulfilment: "SHIPPING",
                updatedAt: UPDATED_AT,
            },
        ]);
        // Each list keeps its ways once each, in table order.
        expect(await arrays("StoreSettings", "storeId")).toEqual({
            s1: ["PICKUP", "SHIPPING"],
            s2: ["PICKUP", "SHIPPING"],
            s3: [],
        });
        expect(await arrays("Product", "id")).toEqual({
            cake: ["PICKUP", "LOCAL_DELIVERY"],
            candle: [],
            ebook: ["DIGITAL"],
            jar: ["LOCAL_DELIVERY", "SHIPPING"],
        });
    });

    it("keeps each column's default, and leaves no old type behind", async () => {
        await client.query(MIGRATION);

        const defaults = await rows<{ t: string; c: string; d: string }>(
            `SELECT table_name AS t, column_name AS c, column_default AS d
             FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND column_name IN ('fulfilment', 'fulfilmentTypes')
             ORDER BY table_name`,
        );
        expect(defaults).toEqual([
            {
                t: "Order",
                c: "fulfilment",
                d: `'PICKUP'::"OrderFulfilment"`,
            },
            {
                t: "Product",
                c: "fulfilmentTypes",
                d: `ARRAY[]::"OrderFulfilment"[]`,
            },
            {
                t: "StoreSettings",
                c: "fulfilmentTypes",
                d: `ARRAY[]::"OrderFulfilment"[]`,
            },
        ]);
        expect(
            await rows(
                `SELECT typname FROM pg_type
                 WHERE typnamespace = current_schema()::regnamespace
                   AND typname LIKE 'OrderFulfilment%'
                   AND typname NOT LIKE '\\_%'`,
            ),
        ).toEqual([{ typname: "OrderFulfilment" }]);
        // A new order still takes Pick-up by default, and a legacy word is
        // no longer a value at all.
        await client.query(
            `INSERT INTO "Order" ("id", "storeId", "stage", "updatedAt")
             VALUES ('new', 's1', 'NEW', now())`,
        );
        expect((await orders()).find((o) => o.id === "new")?.fulfilment).toBe(
            "PICKUP",
        );
        await expect(
            client.query(
                `UPDATE "Order" SET "fulfilment" = 'COLLECT' WHERE "id" = 'new'`,
            ),
        ).rejects.toThrow(/invalid input value for enum/);
    });

    it("run twice by hand, fails the second time and changes nothing", async () => {
        // `migrate deploy` never runs a migration twice; this pins that a
        // replay by hand can't half-apply it either.
        await client.query(MIGRATION);
        await expect(client.query(MIGRATION)).rejects.toThrow();
        await client.query("ROLLBACK");
        expect(await enumValues()).toHaveLength(6);
    });

    it("aborts, changing nothing, if a legacy word survives the backfill", async () => {
        // Stand-in for a straggler the backfill can't reach: a trigger that
        // puts COLLECT back on the row as it is renamed.
        await client.query(`
            CREATE FUNCTION keep_collect() RETURNS trigger AS $$
            BEGIN
                IF OLD."id" = 'late-collect' THEN
                    NEW."fulfilment" := 'COLLECT';
                END IF;
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER keep_collect BEFORE UPDATE ON "Order"
                FOR EACH ROW EXECUTE FUNCTION keep_collect();
        `);

        await expect(client.query(MIGRATION)).rejects.toThrow(
            "An order, storefront or product still holds COLLECT or DELIVERY after the backfill. Nothing was changed.",
        );
        await client.query("ROLLBACK");

        // The type still has all eight values, and every row is as it was.
        expect(await enumValues()).toHaveLength(8);
        expect(
            (await orders()).map((o) => [o.id, o.fulfilment, o.updatedAt]),
        ).toEqual([
            ["digital", "DIGITAL", UPDATED_AT],
            ["late-collect", "COLLECT", UPDATED_AT],
            ["late-delivery", "DELIVERY", UPDATED_AT],
            ["local", "LOCAL_DELIVERY", UPDATED_AT],
            ["pickup", "PICKUP", UPDATED_AT],
            ["shipping", "SHIPPING", UPDATED_AT],
        ]);
        expect((await arrays("StoreSettings", "storeId")).s2).toEqual([
            "SHIPPING",
            "COLLECT",
            "PICKUP",
        ]);
        expect((await arrays("Product", "id")).jar).toEqual([
            "DELIVERY",
            "SHIPPING",
            "LOCAL_DELIVERY",
        ]);
    });
});
