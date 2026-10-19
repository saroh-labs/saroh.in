import { describe, expect, it } from "vitest";

import { pastFreeCancel } from "./free-cancel";

describe("pastFreeCancel", () => {
    const start = "2026-10-20T10:00:00.000Z";
    const at = (iso: string) => Date.parse(iso);
    it("is past once inside the window, never with no rule", () => {
        expect(pastFreeCancel(2, start, at("2026-10-20T07:59:00Z"))).toBe(
            false,
        );
        expect(pastFreeCancel(2, start, at("2026-10-20T08:01:00Z"))).toBe(true);
        expect(pastFreeCancel(null, start, at("2026-10-20T09:59:00Z"))).toBe(
            false,
        );
    });
});
