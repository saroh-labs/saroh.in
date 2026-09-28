import { describe, expect, it } from "vitest";

import { isAccountPath } from "./account-area-switch";

describe("isAccountPath", () => {
    it("is /account and the pages under it", () => {
        expect(isAccountPath("/account")).toBe(true);
        expect(isAccountPath("/account/")).toBe(true);
        expect(isAccountPath("/account/me")).toBe(true);
        expect(isAccountPath("/account/receipts/inv_1")).toBe(true);
    });

    it("is not a page that only starts with the word", () => {
        expect(isAccountPath("/accounts")).toBe(false);
        expect(isAccountPath("/accounting")).toBe(false);
        expect(isAccountPath("/")).toBe(false);
        expect(isAccountPath("/shop/account")).toBe(false);
    });
});
