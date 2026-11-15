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
});
