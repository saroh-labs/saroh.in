// A pack holder's emails (DEC-174 U22, #1153): one credit left, and
// credits expiring in 7 days, in the business's zone; and the receipt's
// line saying what a pack's payment bought. The reads and the queueing are
// `class-packs/redeem-pack.db.spec.ts` and
// `class-packs/pack-expiring.handler.db.spec.ts`.
import { renderNotice } from ".";
import { renderInvoiceReceipt } from "../../communications/transactional";
import { packReceiptLine } from "../../invoices/invoice-receipt.handler";
import type { PackNoticeVars } from "./pack";
import {
    packExpiringNoticeKey,
    packLowNoticeKey,
    packNotice,
    packSentence,
} from "./pack";

// 31 Dec 2026, 7:00 pm UTC: already 1 Jan 2027 in Kolkata.
const LATE = new Date("2026-12-31T19:00:00.000Z");

function vars(over: Partial<PackNoticeVars> = {}): PackNoticeVars {
    return {
        business: "Rye Studio",
        firstName: "Asha",
        pack: "10-class pack",
        left: 1,
        unit: "class",
        expiresAt: LATE,
        timeZone: "Asia/Kolkata",
        ...over,
    };
}

describe("pack notice words", () => {
    it("one credit left says it's the last, and the date in the business's zone", () => {
        expect(packSentence("PACK_LOW", vars())).toBe(
            "You have 1 class left in your 10-class pack. Use it by 1 Jan 2027.",
        );
        expect(packNotice.subject({ kind: "PACK_LOW", pack: vars() })).toBe(
            "You have 1 class left at Rye Studio",
        );
    });

    it("a one-to-one pack counts sessions", () => {
        expect(
            packSentence(
                "PACK_LOW",
                vars({ unit: "session", pack: "5 physio sessions" }),
            ),
        ).toBe(
            "You have 1 session left in your 5 physio sessions. Use it by 1 Jan 2027.",
        );
    });

    it("expiring says how many and when, in the business's zone", () => {
        expect(packSentence("PACK_EXPIRING", vars({ left: 3 }))).toBe(
            "Your 3 classes in your 10-class pack expire on 1 Jan 2027. Book before then to use them.",
        );
        expect(packSentence("PACK_EXPIRING", vars({ left: 1 }))).toBe(
            "Your 1 class in your 10-class pack expires on 1 Jan 2027. Book before then to use it.",
        );
        expect(
            packNotice.subject({ kind: "PACK_EXPIRING", pack: vars() }),
        ).toBe("Your classes at Rye Studio expire on 1 Jan 2027");
        // Another zone, another day.
        expect(
            packSentence(
                "PACK_EXPIRING",
                vars({ left: 2, timeZone: "America/New_York" }),
            ),
        ).toContain("expire on 31 Dec 2026");
    });

    it("the email greets them, escapes what was typed and signs as the business", () => {
        const email = renderNotice({
            kind: "PACK_LOW",
            pack: vars({ pack: "10 <b>classes</b>", business: "Rye & Co." }),
        });
        expect(email.body).toContain("<p>Hi Asha,</p>");
        expect(email.body).toContain("10 &lt;b&gt;classes&lt;/b&gt;");
        expect(email.body).toContain("<p>Rye &amp; Co.</p>");
        expect(email.body).not.toContain("<b>classes");
    });

    it("its switch is Pack credits", () => {
        expect(packNotice.setting).toBe("PACK_CREDITS");
    });

    it("one credit left is keyed to the redemption that brought it there; expiring to the date", () => {
        expect(packLowNoticeKey("pp_1", 9)).toBe("pack-low:pp_1:9");
        expect(
            packExpiringNoticeKey("pp_1", new Date("2026-12-31T19:00:00Z")),
        ).toBe("pack-expiring:pp_1:2026-12-31T19:00:00.000Z");
    });
});

describe("a pack's receipt says what was bought (U22)", () => {
    const purchase = {
        credits: 10,
        expiresAt: LATE,
        pack: { name: "10-class pack", kind: "CLASSES" },
    };

    it("names the pack, the classes and the date, in the business's zone", () => {
        expect(packReceiptLine(purchase, "Asia/Kolkata")).toBe(
            "10-class pack: 10 classes, use them by 1 Jan 2027",
        );
        expect(
            packReceiptLine(
                {
                    credits: 1,
                    expiresAt: LATE,
                    pack: { name: "Trial", kind: "ONE_TO_ONE" },
                },
                "Asia/Kolkata",
            ),
        ).toBe("Trial: 1 session, use it by 1 Jan 2027");
    });

    it("the receipt carries the line, escaped, and nothing for anything else", () => {
        const base = {
            business: "Rye Studio",
            firstName: "Asha",
            number: "RS/26-27/0007",
            amount: "₹4,500",
            method: "online",
            receivedOn: "21 Oct 2026",
            paidSoFar: "₹4,500",
            total: "₹4,500",
            leftToPay: "₹0",
            paidInFull: true,
        };
        const pack = renderInvoiceReceipt({
            ...base,
            pack: "10 <classes> pack: 10 classes, use them by 1 Jan 2027",
        });
        expect(pack.body).toContain(
            "<p>10 &lt;classes&gt; pack: 10 classes, use them by 1 Jan 2027.</p>",
        );
        const plain = renderInvoiceReceipt(base);
        expect(plain.body).not.toContain("use them by");
    });
});
