/**
 * The share sheet's rules (DEC-173, U11 #1123): which message an invoice
 * opens on, what each tab offers, and why a share is off, in the API's
 * words (`invoice-share.service.ts`, `invoice-share-words.ts`).
 */
import { describe, expect, it } from "vitest";

import type { InvoicePayment } from "./service";
import type { ShareInvoice } from "./share";
import {
    defaultShareKind,
    emailView,
    kindChoices,
    LINK_SLOT,
    linkOff,
    logsPaper,
    previewMessage,
    shareLine,
    shareRefusal,
    startKind,
    whatsappOff,
} from "./share";
import {
    AUTOPAY_HOLD,
    CANT_SHARE,
    NO_EMAIL_ADDRESS,
    NOTHING_PAID_YET,
    PAID_SHARE_RECEIPT,
} from "./words";

const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-10-20T06:30:00Z");
const WRITE = { write: true };
const READ = { write: false };

function inv(over: Partial<ShareInvoice> = {}): ShareInvoice {
    return {
        id: "inv_106",
        number: "RC/26-27/0106",
        standing: "OVERDUE",
        kind: "INVOICE",
        source: "MANUAL",
        currency: "INR",
        total: "8400.00",
        leftToPay: "8400.00",
        paidSoFar: "0.00",
        dueAt: "2026-10-07T06:30:00Z",
        contact: { id: "c_1", name: "Vivek Nair", email: "vivek@example.com" },
        billTo: { name: "Vivek Nair", email: "vivek@example.com" },
        updatedAt: "2026-10-19T06:30:00Z",
        send: {
            channels: ["email"],
            emailTo: "vivek@example.com",
            payOnline: true,
            nextReminderAt: null,
            phone: "+919845011234",
        },
        online: { providerConnected: true, payLinkActive: false, payments: [] },
        sent: [],
        ...over,
    };
}

function payment(over: Partial<InvoicePayment> = {}): InvoicePayment {
    return {
        id: "pay_1",
        amount: "4000.00",
        currency: "INR",
        method: "CASH",
        reference: null,
        note: null,
        receivedAt: "2026-10-12T06:30:00Z",
        recordedAt: "2026-10-12T06:30:00Z",
        cheque: null,
        bankStatus: null,
        clearedAt: null,
        bouncedAt: null,
        bounceReason: null,
        removed: null,
        canRemove: true,
        ...over,
    };
}

describe("what can't be shared", () => {
    it("refuses an order's paper, a credit note, a draft, a void and a credited invoice, in the API's words", () => {
        expect(shareRefusal(inv({ source: "ORDER" }))).toBe(
            "This invoice belongs to an order, so share the order instead.",
        );
        expect(shareRefusal(inv({ kind: "CREDIT_NOTE" }))).toBe(
            "A credit note isn't shared from here.",
        );
        expect(shareRefusal(inv({ standing: "DRAFT" }))).toBe(
            "Issue the invoice before sharing it.",
        );
        expect(shareRefusal(inv({ standing: "VOID" }))).toBe(
            "A void invoice isn't shared.",
        );
        expect(shareRefusal(inv({ standing: "CREDITED" }))).toBe(
            "This invoice was cancelled by a credit note.",
        );
        expect(shareRefusal(inv())).toBeNull();
    });

    it("never logs the paper of one that can't be shared, or for a role that only reads", () => {
        expect(logsPaper(inv(), WRITE)).toBe(true);
        expect(logsPaper(inv({ standing: "VOID" }), WRITE)).toBe(false);
        expect(logsPaper(inv(), READ)).toBe(false);
    });
});

describe("the message it opens on", () => {
    it("is a reminder once late or sent, new before, a receipt once paid", () => {
        expect(defaultShareKind(inv())).toBe("REMINDER");
        expect(defaultShareKind(inv({ standing: "ISSUED" }))).toBe("NEW");
        expect(
            defaultShareKind(
                inv({
                    standing: "ISSUED",
                    sent: [
                        {
                            id: "s1",
                            channel: "email",
                            to: "vivek@example.com",
                            at: "2026-10-18T06:30:00Z",
                            reminder: false,
                            status: "SENT",
                        },
                    ],
                }),
            ),
        ).toBe("REMINDER");
        expect(defaultShareKind(inv({ standing: "PAID" }))).toBe("RECEIPT");
    });

    it("offers Thank you, paid only once something is paid, and only a receipt once all is", () => {
        const owed = kindChoices(inv());
        expect(owed.find((c) => c.value === "RECEIPT")).toMatchObject({
            disabled: true,
            reason: NOTHING_PAID_YET,
        });
        const paid = kindChoices(
            inv({ standing: "PAID", paidSoFar: "8400.00", leftToPay: "0.00" }),
        );
        expect(paid.find((c) => c.value === "NEW")).toMatchObject({
            disabled: true,
            reason: PAID_SHARE_RECEIPT,
        });
        expect(paid.find((c) => c.value === "RECEIPT")?.disabled).toBeFalsy();
        const partly = kindChoices(inv({ paidSoFar: "1000.00" }));
        expect(partly.every((c) => !c.disabled)).toBe(true);
    });

    it("starts on the one asked for, unless it can't go", () => {
        expect(startKind(inv(), "NEW")).toBe("NEW");
        expect(startKind(inv(), "RECEIPT")).toBe("REMINDER");
    });
});

describe("the line under the title", () => {
    it("says who, how much and how late", () => {
        expect(shareLine(inv(), ZONE, NOW)).toBe(
            "Vivek Nair · ₹8,400 · 13 days late",
        );
        expect(
            shareLine(
                inv({ paidSoFar: "4000.00", leftToPay: "4400.00" }),
                ZONE,
                NOW,
            ),
        ).toBe("Vivek Nair · ₹4,400 left of ₹8,400 · 13 days late");
        expect(
            shareLine(
                inv({ standing: "ISSUED", dueAt: "2026-10-27T06:30:00Z" }),
                ZONE,
                NOW,
            ),
        ).toBe("Vivek Nair · ₹8,400 · due 27 Oct");
        expect(shareLine(inv({ standing: "PAID" }), ZONE, NOW)).toBe(
            "Vivek Nair · ₹8,400 · paid",
        );
    });
});

describe("the preview, in the API's words", () => {
    const words = (
        over: Partial<ShareInvoice>,
        kind: "NEW" | "REMINDER" | "RECEIPT",
    ) =>
        previewMessage({
            invoice: inv(over),
            kind,
            business: "Rye & Co.",
            timeZone: ZONE,
            now: NOW,
        });

    it("a reminder names the amount and the due date, with the link to come", () => {
        expect(words({}, "REMINDER")).toBe(
            `Hi Vivek, this is Rye & Co. Your invoice RC/26-27/0106 for ₹8,400 was due on 7 Oct. You can see it and pay here: ${LINK_SLOT} Thank you.`,
        );
    });

    it("a partly paid reminder says what is left", () => {
        expect(
            words({ paidSoFar: "1000.00", total: "2500.00" }, "REMINDER"),
        ).toContain("has ₹1,500 left of ₹2,500 to pay. It was due on 7 Oct.");
    });

    it("without online payment, the link shows how to pay", () => {
        expect(
            words(
                {
                    standing: "ISSUED",
                    send: {
                        channels: [],
                        payOnline: false,
                        nextReminderAt: null,
                    },
                },
                "NEW",
            ),
        ).toBe(
            `Hi Vivek, this is Rye & Co. Here is your invoice RC/26-27/0106 for ₹8,400, due on 7 Oct. You can see it and how to pay here: ${LINK_SLOT} Thank you.`,
        );
    });

    it("a receipt thanks them for the last payment and says what is left", () => {
        expect(
            words(
                {
                    paidSoFar: "4000.00",
                    leftToPay: "4400.00",
                    payments: [payment()],
                },
                "RECEIPT",
            ),
        ).toBe(
            `Hi Vivek, this is Rye & Co. Thank you for your payment of ₹4,000 in cash for invoice RC/26-27/0106. Paid so far: ₹4,000 of ₹8,400. Left to pay: ₹4,400. You can see it here: ${LINK_SLOT}`,
        );
    });

    it("signs with the name on the issued paper", () => {
        expect(words({ sellerName: "Pulse" }, "REMINDER")).toMatch(
            /^Hi Vivek, this is Pulse\. /,
        );
    });
});

describe("WhatsApp", () => {
    it("is open to a role that writes, on an owed invoice", () => {
        expect(whatsappOff(inv(), "REMINDER", WRITE, null, NOW)).toBeNull();
    });

    it("is off for a role that only reads", () => {
        expect(whatsappOff(inv(), "REMINDER", READ, null, NOW)).toEqual({
            reason: CANT_SHARE,
        });
    });

    it("is off for a void or a draft, with the API's reason", () => {
        expect(
            whatsappOff(inv({ standing: "VOID" }), "NEW", WRITE, null, NOW),
        ).toEqual({ reason: "A void invoice isn't shared." });
        expect(
            whatsappOff(inv({ standing: "DRAFT" }), "NEW", WRITE, null, NOW),
        ).toEqual({ reason: "Issue the invoice before sharing it." });
    });

    it("holds a reminder reminded today until the time the API gave", () => {
        const retryAt = "2026-10-21T04:00:00Z";
        expect(whatsappOff(inv(), "REMINDER", WRITE, retryAt, NOW)).toEqual({
            reason: "",
            retryAt,
        });
        // From the read too, before anyone presses.
        expect(
            whatsappOff(
                inv({
                    send: {
                        channels: ["email"],
                        payOnline: true,
                        nextReminderAt: retryAt,
                    },
                }),
                "REMINDER",
                WRITE,
                null,
                NOW,
            ),
        ).toEqual({ reason: "", retryAt });
        // A new invoice's message isn't a reminder.
        expect(whatsappOff(inv(), "NEW", WRITE, retryAt, NOW)).toBeNull();
        // Once that time has passed, it can go.
        expect(
            whatsappOff(inv(), "REMINDER", WRITE, "2026-10-19T04:00:00Z", NOW),
        ).toBeNull();
    });

    it("waits while autopay is charging, but a receipt still goes", () => {
        const charging = inv({
            paidSoFar: "1000.00",
            online: {
                providerConnected: true,
                payLinkActive: true,
                payments: [],
                autopayCharge: { at: "2026-10-20T05:00:00Z" },
            },
        });
        expect(whatsappOff(charging, "REMINDER", WRITE, null, NOW)).toEqual({
            reason: AUTOPAY_HOLD,
        });
        expect(whatsappOff(charging, "RECEIPT", WRITE, null, NOW)).toBeNull();
    });
});

describe("Link", () => {
    it("is off for a reader, a refused invoice or an autopay charge", () => {
        expect(linkOff(inv(), WRITE)).toBeNull();
        expect(linkOff(inv(), READ)).toEqual({ reason: CANT_SHARE });
        expect(linkOff(inv({ standing: "DRAFT" }), WRITE)?.reason).toBe(
            "Issue the invoice before sharing it.",
        );
        expect(
            linkOff(
                inv({
                    send: {
                        channels: [],
                        reason: "AUTOPAY_PENDING",
                        payOnline: true,
                        nextReminderAt: null,
                    },
                }),
                WRITE,
            ),
        ).toEqual({ reason: AUTOPAY_HOLD });
    });
});

describe("Email", () => {
    it("sends a first one, then reminds, to the address on file", () => {
        expect(
            emailView(inv({ standing: "ISSUED" }), WRITE, null, undefined, NOW),
        ).toEqual({
            kind: "send",
            to: "vivek@example.com",
            threadOnly: false,
            off: null,
        });
    });

    it("says there is no email of the business's own, without a provider", () => {
        expect(
            emailView(
                inv({
                    send: {
                        channels: [],
                        reason: "NO_EMAIL_PROVIDER",
                        payOnline: true,
                        nextReminderAt: null,
                    },
                }),
                WRITE,
                null,
                undefined,
                NOW,
            ),
        ).toEqual({ kind: "noProvider" });
        // A paid invoice's receipt, the same.
        expect(
            emailView(inv({ standing: "PAID" }), WRITE, null, false, NOW),
        ).toEqual({ kind: "noProvider" });
    });

    it("says why when there is no address", () => {
        expect(
            emailView(
                inv({
                    send: {
                        channels: [],
                        reason: "NO_EMAIL_ADDRESS",
                        payOnline: true,
                        nextReminderAt: null,
                    },
                }),
                WRITE,
                null,
                undefined,
                NOW,
            ),
        ).toEqual({ kind: "off", reason: NO_EMAIL_ADDRESS });
    });

    it("emails the receipt once paid", () => {
        expect(
            emailView(inv({ standing: "PAID" }), WRITE, null, true, NOW),
        ).toEqual({ kind: "receipt", off: null });
    });

    it("holds a second reminder in a day, and refuses a reader", () => {
        const sent = inv({
            sent: [
                {
                    id: "s1",
                    channel: "email",
                    to: "vivek@example.com",
                    at: "2026-10-20T04:00:00Z",
                    reminder: true,
                    status: "SENT",
                },
            ],
            send: {
                channels: ["email"],
                emailTo: "vivek@example.com",
                payOnline: true,
                nextReminderAt: "2026-10-21T04:00:00Z",
            },
        });
        expect(emailView(sent, WRITE, null, undefined, NOW)).toMatchObject({
            kind: "remind",
            off: { retryAt: "2026-10-21T04:00:00Z" },
        });
        expect(emailView(sent, READ, null, undefined, NOW)).toEqual({
            kind: "off",
            reason: CANT_SHARE,
        });
    });
});
