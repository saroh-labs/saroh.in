import { describe, expect, it } from "vitest";

import type { Db } from "./helpers";
import { syncStorefrontFulfilmentTypes } from "./helpers";

/** A Db whose `$executeRaw` records the statement instead of running it. */
function recordingDb() {
    const calls: { sql: string; values: unknown[] }[] = [];
    const db = {
        $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
            calls.push({ sql: strings.join("?"), values });
            return Promise.resolve(3);
        },
    } as unknown as Db;
    return { db, calls };
}

describe("syncStorefrontFulfilmentTypes (review M-5)", () => {
    it("rewrites only the storefronts of the businesses the seed wrote", async () => {
        const { db, calls } = recordingDb();
        await syncStorefrontFulfilmentTypes(db, ["seed_org_a", "seed_org_b"]);

        expect(calls).toHaveLength(1);
        const [call] = calls;
        expect(call.sql.replace(/\s+/g, " ")).toContain(
            'WHERE s."storeId" IN ( SELECT st."id" FROM "Store" st WHERE st."organizationId" = ANY(?::text[]) )',
        );
        expect(call.values.at(-1)).toEqual(["seed_org_a", "seed_org_b"]);
    });

    it("touches nothing when it is given no business", async () => {
        const { db, calls } = recordingDb();
        expect(await syncStorefrontFulfilmentTypes(db, [])).toBe(0);
        expect(calls).toHaveLength(0);
    });
});
