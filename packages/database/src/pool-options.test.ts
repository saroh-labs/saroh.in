import { describe, expect, it } from "vitest";

import { poolOptions } from "./pool-options";

describe("poolOptions", () => {
    it("takes max from DB_POOL_MAX", () => {
        expect(poolOptions({ DB_POOL_MAX: "7" }).max).toBe(7);
    });

    it("keeps pg's default when unset or not a positive whole number", () => {
        for (const v of [undefined, "", "0", "-3", "2.5", "ten"]) {
            expect(poolOptions({ DB_POOL_MAX: v })).not.toHaveProperty("max");
        }
    });

    it("bounds every wait by default, each settable and 0 turning it off", () => {
        const d = poolOptions({});
        expect(d.connectionTimeoutMillis).toBe(10_000);
        expect(d.statement_timeout).toBe(30_000);
        expect(d.idle_in_transaction_session_timeout).toBe(60_000);
        const set = poolOptions({
            DB_POOL_CONNECT_TIMEOUT_MS: "2000",
            DB_STATEMENT_TIMEOUT_MS: "0",
            DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "nope",
        });
        expect(set.connectionTimeoutMillis).toBe(2000);
        expect(set.statement_timeout).toBeUndefined();
        expect(set.idle_in_transaction_session_timeout).toBe(60_000);
    });
});
