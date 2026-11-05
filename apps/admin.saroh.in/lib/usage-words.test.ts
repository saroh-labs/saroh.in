import { describe, expect, it } from "vitest";

import {
    formatLimit,
    formatStorage,
    pageCount,
    readOrder,
    readPage,
    usageHref,
} from "./usage-words";

describe("usage words (#798)", () => {
    it("says storage in the unit that shows it, MB below a GB", () => {
        expect(formatStorage(0)).toBe("0 MB");
        expect(formatStorage(-1)).toBe("0 MB");
        expect(formatStorage(Number.NaN)).toBe("0 MB");
        expect(formatStorage(10)).toBe("1 KB");
        expect(formatStorage(640_000)).toBe("640 KB");
        expect(formatStorage(12_440_000)).toBe("12.4 MB");
        expect(formatStorage(999_000_000)).toBe("999 MB");
        expect(formatStorage(2_345_000_000)).toBe("2.35 GB");
        expect(formatStorage(1_234_500_000_000)).toBe("1,234.5 GB");
    });

    it("says a plan's limit, or a dash with none", () => {
        expect(formatLimit(4)).toBe("4 GB");
        expect(formatLimit(0.5)).toBe("500 MB");
        expect(formatLimit(null)).toBe("—");
    });

    it("reads the order and page from the query string, defaulting safely", () => {
        expect(readOrder(undefined)).toBe("most");
        expect(readOrder("least")).toBe("least");
        expect(readOrder("closest")).toBe("closest");
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
