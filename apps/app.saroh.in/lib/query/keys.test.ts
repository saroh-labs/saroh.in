/**
 * Keys carry the business (DEC-259): built only by `domainKey`, so a key
 * without an organization fails the typecheck.
 */
import { describe, expect, it } from "vitest";

import type { DomainKey } from "@/lib/query/keys";
import { domainKey, isOrgKey } from "@/lib/query/keys";

describe("domainKey", () => {
    it("is [domain, orgId, ...rest]", () => {
        expect(domainKey("orders", "o1", "list", { page: 2 })).toEqual([
            "orders",
            "o1",
            "list",
            { page: 2 },
        ]);
    });

    it("refuses a key with no business", () => {
        expect(() => domainKey("orders", "")).toThrow(/orgId/);
    });

    it("an unbranded key doesn't pass for one", () => {
        // @ts-expect-error a bare tuple is not a DomainKey
        const bare: DomainKey = ["orders", "o1", "list"];
        expect(bare).toBeDefined();
    });

    it("says whose a key is", () => {
        const key = domainKey("orders", "o1", "list");
        expect(isOrgKey(key, "o1")).toBe(true);
        expect(isOrgKey(key, "o2")).toBe(false);
    });
});
