import { beforeEach, describe, expect, it } from "vitest";

import {
    copyLinkLabel,
    forgetLinks,
    mintedLink,
    rememberLink,
} from "./minted-links";

/**
 * Pay links made in this tab (UX-048): the API keeps only a hash, so the
 * address is kept here to show again, never re-made by asking.
 */
describe("minted pay links", () => {
    beforeEach(() => forgetLinks());

    it("has nothing for an invoice no link was made for", () => {
        expect(mintedLink("inv_1")).toBeNull();
    });

    it("keeps the latest address per invoice", () => {
        rememberLink("inv_1", "https://rye.saroh.app/pay/a");
        rememberLink("inv_1", "https://rye.saroh.app/pay/b");
        rememberLink("inv_2", "https://rye.saroh.app/pay/c");
        expect(mintedLink("inv_1")).toBe("https://rye.saroh.app/pay/b");
        expect(mintedLink("inv_2")).toBe("https://rye.saroh.app/pay/c");
    });
});

describe("copyLinkLabel", () => {
    const base = { busy: false, shown: false, linkOut: false };

    it("offers a first link plainly", () => {
        expect(copyLinkLabel(base)).toBe("Copy pay link");
    });

    it("says a new link retires the one already out", () => {
        expect(copyLinkLabel({ ...base, linkOut: true })).toBe(
            "Copy new link (the old one stops working)",
        );
    });

    it("copies the shown link without making a new one", () => {
        expect(copyLinkLabel({ ...base, shown: true, linkOut: true })).toBe(
            "Copy link",
        );
    });

    it("says it is working while the link is made", () => {
        expect(copyLinkLabel({ ...base, busy: true })).toBe("Making a link…");
    });
});
