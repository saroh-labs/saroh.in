import { beforeEach, describe, expect, it } from "vitest";

import {
    copyLinkLabel,
    forgetLink,
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

/**
 * #870: a remembered link is forgotten once it can't be the one out, so
 * "Show link again" never shows a dead link.
 */
describe("a remembered link that was replaced or ended", () => {
    beforeEach(() => forgetLinks());
    const url = "https://rye.saroh.app/pay/a";
    const T0 = "2026-10-08T10:00:00.000Z";
    const T1 = "2026-10-08T10:00:05.000Z";
    const T2 = "2026-10-08T10:30:00.000Z";

    it("forgetLink drops it for that invoice only", () => {
        rememberLink("inv_1", url);
        rememberLink("inv_2", url);
        forgetLink("inv_1");
        expect(mintedLink("inv_1")).toBeNull();
        expect(mintedLink("inv_2")).toBe(url);
    });

    it.each(["PAID", "VOID", "CREDITED"])(
        "on a %s invoice there is nothing to show again",
        (standing) => {
            rememberLink("inv_1", url, T0);
            expect(mintedLink("inv_1", { standing, updatedAt: T0 })).toBeNull();
            // Gone for good, not hidden for this read.
            expect(mintedLink("inv_1")).toBeNull();
        },
    );

    it.each(["ISSUED", "OVERDUE"])(
        "on an %s invoice it is shown again",
        (standing) => {
            rememberLink("inv_1", url, T0);
            expect(mintedLink("inv_1", { standing, updatedAt: T0 })).toBe(url);
        },
    );

    it("survives the change its own making caused", () => {
        rememberLink("inv_1", url, T0);
        // The read from before it was made, then the first one after.
        expect(mintedLink("inv_1", { standing: "ISSUED", updatedAt: T0 })).toBe(
            url,
        );
        expect(mintedLink("inv_1", { standing: "ISSUED", updatedAt: T1 })).toBe(
            url,
        );
        expect(mintedLink("inv_1", { standing: "ISSUED", updatedAt: T1 })).toBe(
            url,
        );
    });

    it("is forgotten when the invoice changes again: something may have replaced it", () => {
        // The customer's own "Pay now" on their account, say.
        rememberLink("inv_1", url, T0);
        mintedLink("inv_1", { standing: "ISSUED", updatedAt: T1 });
        expect(
            mintedLink("inv_1", { standing: "OVERDUE", updatedAt: T2 }),
        ).toBeNull();
        expect(mintedLink("inv_1")).toBeNull();
    });

    it("keeps it when a read has no time to compare", () => {
        rememberLink("inv_1", url);
        expect(mintedLink("inv_1", { standing: "ISSUED" })).toBe(url);
    });
});

/**
 * #870, owner 8 Oct: the invoice keeps when its link was made. A new date
 * means a new token; any other change leaves the link that is out alone.
 */
describe("a remembered link, judged by its own date", () => {
    beforeEach(() => forgetLinks());
    const url = "https://rye.saroh.app/pay/a";
    const BEFORE = "2026-10-08T09:00:00.000Z";
    const MADE = "2026-10-08T10:00:00.000Z";
    const LATER = "2026-10-08T10:30:00.000Z";
    const LATEST = "2026-10-08T11:00:00.000Z";

    it("is shown again however often the invoice changes otherwise", () => {
        rememberLink("inv_1", url, BEFORE, MADE);
        for (const updatedAt of [MADE, LATER, LATEST]) {
            expect(
                mintedLink("inv_1", {
                    standing: "ISSUED",
                    updatedAt,
                    payLinkMadeAt: MADE,
                }),
            ).toBe(url);
        }
    });

    it("is forgotten when a read names a later link: another was made", () => {
        rememberLink("inv_1", url, BEFORE, MADE);
        expect(
            mintedLink("inv_1", {
                standing: "ISSUED",
                updatedAt: LATER,
                payLinkMadeAt: LATER,
            }),
        ).toBeNull();
        expect(mintedLink("inv_1")).toBeNull();
    });

    it("survives a read from before it was made", () => {
        rememberLink("inv_1", url, BEFORE, MADE);
        // No link yet, or the one it replaced.
        expect(
            mintedLink("inv_1", {
                standing: "ISSUED",
                updatedAt: BEFORE,
                payLinkMadeAt: null,
            }),
        ).toBe(url);
        expect(
            mintedLink("inv_1", {
                standing: "ISSUED",
                updatedAt: BEFORE,
                payLinkMadeAt: BEFORE,
            }),
        ).toBe(url);
    });

    it("is forgotten when the link was cleared after it was made", () => {
        rememberLink("inv_1", url, BEFORE, MADE);
        expect(
            mintedLink("inv_1", {
                standing: "ISSUED",
                updatedAt: LATER,
                payLinkMadeAt: null,
            }),
        ).toBeNull();
    });

    it("falls back to the invoice's changes when a read has no date (older API)", () => {
        rememberLink("inv_1", url, BEFORE, MADE);
        mintedLink("inv_1", { standing: "ISSUED", updatedAt: MADE });
        expect(
            mintedLink("inv_1", { standing: "ISSUED", updatedAt: LATER }),
        ).toBeNull();
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

    it("names the day it was made when that is known (#870)", () => {
        expect(unseenLinkLine({ sendable: false, madeOn: "8 Oct 2026" })).toBe(
            "A pay link was made on 8 Oct 2026 and still works. Its full address is shown only once, when it's made, so it can't be shown again here or on another device. Making a new link ends the old one.",
        );
        expect(unseenLinkLine({ sendable: false, madeOn: null })).toMatch(
            /^A pay link is out and still works\./,
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
