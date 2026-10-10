import { describe, expect, it } from "vitest";

import {
    formatGb,
    pageCount,
    readOrder,
    readPage,
    usageHref,
} from "./usage-words";

describe("usage words (#798)", () => {
    it("says storage in GB, nothing as 0 GB", () => {
        expect(formatGb(0)).toBe("0 GB");
        expect(formatGb(-1)).toBe("0 GB");
        expect(formatGb(Number.NaN)).toBe("0 GB");
        expect(formatGb(0.01)).toBe("0.01 GB");
        expect(formatGb(2.35)).toBe("2.35 GB");
        expect(formatGb(1234.5)).toBe("1,234.50 GB");
    });

    it("reads the order and page from the query string, defaulting safely", () => {
        expect(readOrder(undefined)).toBe("most");
        expect(readOrder("least")).toBe("least");
        expect(readOrder("biggest")).toBe("most");
        expect(readPage(undefined)).toBe(1);
        expect(readPage("3")).toBe(3);
        expect(readPage("0")).toBe(1);
        expect(readPage("2.5")).toBe(1);
        expect(readPage("abc")).toBe(1);
    });

    it("counts pages, at least one", () => {
        expect(pageCount(0, 25)).toBe(1);
        expect(pageCount(25, 25)).toBe(1);
        expect(pageCount(26, 25)).toBe(2);
        expect(pageCount(10, 0)).toBe(1);
    });

    it("builds the screen's address, leaving the defaults out", () => {
        expect(usageHref("most", 1)).toBe("/usage");
        expect(usageHref("least", 1)).toBe("/usage?order=least");
        expect(usageHref("most", 3)).toBe("/usage?page=3");
        expect(usageHref("least", 2)).toBe("/usage?order=least&page=2");
    });
});
