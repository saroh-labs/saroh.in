/**
 * Remind all's pure parts (Home plan U8): the words for when a bill was
 * last heard of, the reminder email as plain words for the preview, and
 * Home's bill row saying "reminded yesterday".
 */
import { SECRET_LINK_SLOT } from "../communications/transactional";
import { plainWords } from "../invoices/invoice-reminder-sample";
import { daysAgo, heardWords } from "../invoices/overdue-bills";
import { rowsOf } from "./home-needs";

const ZONE = "Asia/Kolkata";
// 10:00 IST, 19 Oct.
const NOW = new Date("2026-10-19T04:30:00Z");

describe("heardWords", () => {
    it("counts calendar days in the business's zone", () => {
        // 23:30 IST the night before is yesterday, though under 24 hours.
        const lateLastNight = new Date("2026-10-18T18:00:00Z");
        expect(daysAgo(lateLastNight, NOW, ZONE)).toBe(1);
        expect(
            heardWords({ at: lateLastNight, reminder: true }, NOW, ZONE),
        ).toBe("Reminded yesterday");
        // 00:30 IST today is today.
        expect(
            heardWords(
                { at: new Date("2026-10-18T19:00:00Z"), reminder: true },
                NOW,
                ZONE,
            ),
        ).toBe("Reminded today");
    });

    it("says a first send as Sent, and days beyond one in a number", () => {
        expect(
            heardWords(
                { at: new Date("2026-10-17T06:00:00Z"), reminder: false },
                NOW,
                ZONE,
            ),
        ).toBe("Sent 2 days ago");
    });
});

describe("plainWords", () => {
    it("reads the email as a person would, the link named", () => {
        const html = [
            "<p>Hi Shruti,</p>",
            "<p>Invoice RC/26-27/0056 for ₹11,250 was due on 20 Sep 2026 and hasn&#39;t been paid yet.</p>",
            `<p>You can pay it by UPI or card here:<br><a href="${SECRET_LINK_SLOT}">${SECRET_LINK_SLOT}</a></p>`,
            "<p>Rye &amp; Co.</p>",
        ].join("\n");
        expect(plainWords(html)).toBe(
            [
                "Hi Shruti,",
                "Invoice RC/26-27/0056 for ₹11,250 was due on 20 Sep 2026 and hasn't been paid yet.",
                "You can pay it by UPI or card here: [their own link]",
                "Rye & Co.",
            ].join("\n"),
        );
        expect(plainWords(html)).not.toContain(SECRET_LINK_SLOT);
    });
});

describe("Home's overdue bill row", () => {
    const action = (reminded?: string) => ({
        code: "PAYMENTS_OVERDUE_INVOICES",
        title: "Chase an overdue invoice",
        href: "/billing/invoices/inv_1",
        severity: "OVERDUE" as const,
        count: 1,
        tone: "bad" as const,
        evidence: [
            {
                id: "inv_1",
                title: "RC/0056",
                subtitle: "Arjun Mehta",
                at: "2026-09-22T00:00:00.000Z",
                amountMinor: 180000,
                currency: "INR",
                href: "/billing/invoices/inv_1",
                ...(reminded ? { reminded } : {}),
            },
        ],
    });

    it("says when it was last reminded, after when it was due", () => {
        const [row] = rowsOf(action("Reminded yesterday"), ZONE);
        expect(row?.need.sub).toBe(
            "RC/0056 · was due 22 Sep · reminded yesterday",
        );
    });

    it("says nothing more when it wasn't reminded this week", () => {
        const [row] = rowsOf(action(), ZONE);
        expect(row?.need.sub).toBe("RC/0056 · was due 22 Sep");
    });
});
