import { beforeEach, describe, expect, it } from "vitest";

import {
    copyLinkLabel,
    forgetLinks,
    linkSight,
    mintedLink,
    newLinkWarning,
    rememberLink,
    UNSEEN_LINK,
    unseenLinkLine,
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

    it("offers a new link, not a copy, when the one out can't be shown", () => {
        expect(copyLinkLabel({ ...base, linkOut: true })).toBe(
            "Make a new link",
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

/**
 * After a reload or on another device (UX-048, owner 8 Oct: hash-only):
 * a link that is out can't be shown, only replaced, and the screen says so.
 */
describe("linkSight", () => {
    it("has no link when none is out", () => {
        expect(linkSight({ linkOut: false, held: false })).toBe("none");
    });

    it("shows again a link this tab made", () => {
        expect(linkSight({ linkOut: true, held: true })).toBe("held");
    });

    it("can't show one out that this tab didn't make", () => {
        expect(linkSight({ linkOut: true, held: false })).toBe("unseen");
    });
});

describe("the unseen link's words", () => {
    it("says why the address isn't shown, and that a new link ends the old one", () => {
        expect(unseenLinkLine({ sendable: false })).toBe(
            "A pay link is out and still works. Its full address is shown only once, when it's made, so it can't be shown again here or on another device. Making a new link ends the old one.",
        );
    });

    it("says sending ends it too where the invoice can be sent", () => {
        expect(unseenLinkLine({ sendable: true })).toContain(
            "Making a new link, or sending the invoice, ends the old one.",
        );
    });

    it("asks before replacing it, naming who gets the new one", () => {
        expect(UNSEEN_LINK.confirmTitle).toBe("Make a new pay link?");
        expect(UNSEEN_LINK.confirmLabel).toBe("Make a new link");
        expect(UNSEEN_LINK.cancelLabel).toBe("Keep the old one");
        expect(newLinkWarning("Farah Khan")).toBe(
            "The link that's out stops working straight away, for anyone who has it. Send Farah Khan the new one.",
        );
    });
});
