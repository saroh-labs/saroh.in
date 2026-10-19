import {
    renderInvoiceReceipt,
    SECRET_LINK_SLOT,
} from "../communications/transactional";
import type { ShareWordsInput } from "./invoice-share-words";
import {
    firstNameOf,
    paymentMethodWords,
    shareMessage,
} from "./invoice-share-words";

const LINK = "https://rye.example/pay/tok";

const base: ShareWordsInput = {
    kind: "REMINDER",
    business: "Rye & Co.",
    firstName: "Vivek",
    number: "RC/26-27/0106",
    currency: "INR",
    totalCents: 840000,
    paidCents: 0,
    dueAt: new Date("2026-10-07T06:30:00.000Z"),
    overdue: true,
    zone: "Asia/Kolkata",
    link: LINK,
    payOnline: true,
};

describe("shareMessage (DEC-173): what WhatsApp opens with", () => {
    it("reminds of an overdue invoice in the business's voice, as INVShareA draws it", () => {
        expect(shareMessage(base)).toBe(
            `Hi Vivek, this is Rye & Co. Your invoice RC/26-27/0106 for ₹8,400 was due on 7 Oct. You can see it and pay here: ${LINK} Thank you.`,
        );
    });

    it("asks a partly paid invoice for what is left: ₹1,500 left of ₹2,500", () => {
        const text = shareMessage({
            ...base,
            totalCents: 250000,
            paidCents: 100000,
        });
        expect(text).toContain("₹1,500 left of ₹2,500");
        expect(text).toContain("It was due on 7 Oct.");
        expect(text).not.toContain("for ₹2,500 was due");
    });

    it("reminds before the due date, and with no due date", () => {
        expect(shareMessage({ ...base, overdue: false })).toContain(
            "A reminder that your invoice RC/26-27/0106 for ₹8,400 is due on 7 Oct.",
        );
        expect(
            shareMessage({ ...base, overdue: false, dueAt: null }),
        ).toContain("for ₹8,400 is still to be paid.");
        expect(
            shareMessage({
                ...base,
                overdue: false,
                totalCents: 250000,
                paidCents: 100000,
            }),
        ).toContain("has ₹1,500 left of ₹2,500 to pay, due on 7 Oct.");
    });

    it("sends a new invoice, with its due date", () => {
        expect(shareMessage({ ...base, kind: "NEW", overdue: false })).toBe(
            `Hi Vivek, this is Rye & Co. Here is your invoice RC/26-27/0106 for ₹8,400, due on 7 Oct. You can see it and pay here: ${LINK} Thank you.`,
        );
    });

    it("says hello with no name, and offers the view link when it can't be paid online", () => {
        const text = shareMessage({
            ...base,
            firstName: null,
            payOnline: false,
        });
        expect(text.startsWith("Hello, this is Rye & Co.")).toBe(true);
        expect(text).toContain(`You can see it and how to pay here: ${LINK}`);
        expect(text).not.toContain("and pay here");
    });

    it("ends the business's name with one full stop", () => {
        expect(shareMessage({ ...base, business: "Pulse Fitness" })).toMatch(
            /^Hi Vivek, this is Pulse Fitness\. Your invoice/,
        );
        expect(shareMessage(base)).toMatch(
            /^Hi Vivek, this is Rye & Co\. Your/,
        );
    });

    it("leaves the link line out when there is no link", () => {
        expect(shareMessage({ ...base, link: null })).not.toContain("here:");
    });

    it("thanks for a part payment with paid so far and left to pay", () => {
        expect(
            shareMessage({
                ...base,
                kind: "RECEIPT",
                paidCents: 400000,
                payment: { amountCents: 400000, method: "CASH" },
            }),
        ).toBe(
            `Hi Vivek, this is Rye & Co. Thank you for your payment of ₹4,000 in cash for invoice RC/26-27/0106. Paid so far: ₹4,000 of ₹8,400. Left to pay: ₹4,400. You can see it here: ${LINK}`,
        );
    });

    it("thanks for the last payment and says paid in full", () => {
        const text = shareMessage({
            ...base,
            kind: "RECEIPT",
            paidCents: 840000,
            payment: { amountCents: 440000, method: "UPI" },
        });
        expect(text).toContain("payment of ₹4,400 by UPI");
        expect(text).toContain("It is now paid in full.");
        expect(text).not.toContain("Left to pay");
    });

    it("names the methods it can, and none for Other", () => {
        expect(paymentMethodWords("CHEQUE")).toBe("by cheque");
        expect(paymentMethodWords("ONLINE")).toBe("online");
        expect(paymentMethodWords("OTHER")).toBeNull();
    });

    it("takes the first name of a bill-to", () => {
        expect(firstNameOf("  Vivek Nair ")).toBe("Vivek");
        expect(firstNameOf("")).toBeNull();
        expect(firstNameOf(null)).toBeNull();
    });
});

describe("renderInvoiceReceipt (DEC-173): the receipt email", () => {
    const vars = {
        business: "Rye & Co.",
        firstName: "Vivek",
        number: "RC/26-27/0106",
        amount: "₹4,000",
        method: "in cash",
        receivedOn: "20 Oct 2026",
        paidSoFar: "₹4,000",
        total: "₹8,400",
        leftToPay: "₹4,400",
        paidInFull: false,
    };

    it("says what came in, what is paid so far and what is left", () => {
        const { subject, body } = renderInvoiceReceipt(vars);
        expect(subject).toBe("Receipt for ₹4,000 from Rye & Co.");
        expect(body).toContain("Hi Vivek,");
        expect(body).toContain(
            "Rye &amp; Co. has received your payment of ₹4,000 in cash on 20 Oct 2026, for invoice RC/26-27/0106.",
        );
        expect(body).toContain("Paid so far: ₹4,000 of ₹8,400");
        expect(body).toContain("Left to pay: ₹4,400");
        // No link: one would retire the link the customer already has.
        expect(body).not.toContain(SECRET_LINK_SLOT);
        expect(body).not.toContain("href");
    });

    it("says paid in full once nothing is left", () => {
        const { body } = renderInvoiceReceipt({
            ...vars,
            paidSoFar: "₹8,400",
            leftToPay: "₹0",
            paidInFull: true,
        });
        expect(body).toContain("is now paid in full (₹8,400)");
        expect(body).not.toContain("Left to pay");
    });

    it("escapes what a person typed", () => {
        const { body } = renderInvoiceReceipt({
            ...vars,
            firstName: "<b>Viv</b>",
            method: null,
        });
        expect(body).toContain("Hi &lt;b&gt;Viv&lt;/b&gt;,");
        expect(body).toContain("payment of ₹4,000 on 20 Oct 2026");
    });
});
