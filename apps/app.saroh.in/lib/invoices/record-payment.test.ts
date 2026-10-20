import { describe, expect, it } from "vitest";

import type { PaymentTarget } from "./record-payment";
import {
    amountHint,
    bouncedLine,
    checkAmount,
    clearedAtFor,
    paymentTargetOf,
    receiptNote,
    receivedDate,
    recordedToast,
    recordLabel,
    recordSubline,
    referenceWords,
    toPaise,
} from "./record-payment";
import type { Invoice } from "./service";

const T: PaymentTarget = {
    id: "inv_1",
    number: "RC/26-27/0106",
    who: "Vivek Nair",
    currency: "INR",
    total: "8400.00",
    leftToPay: "8400.00",
    emailTo: null,
};

describe("Record payment's words and rules (DEC-173, U10)", () => {
    it("reads money as paise, refusing what isn't money", () => {
        expect(toPaise("4000")).toBe(400000);
        expect(toPaise("4000.5")).toBe(400050);
        expect(toPaise("12.345")).toBeNull();
        expect(toPaise("abc")).toBeNull();
    });

    it("says what is left of what", () => {
        expect(recordSubline({ ...T, leftToPay: "4400.00" })).toBe(
            "RC/26-27/0106 · Vivek Nair · ₹4,400 left of ₹8,400",
        );
    });

    it("all, part, nothing and too much", () => {
        expect(checkAmount("8400", T)).toEqual({
            ok: true,
            paise: 840000,
            part: false,
        });
        expect(checkAmount("4000", T)).toEqual({
            ok: true,
            paise: 400000,
            part: true,
        });
        expect(checkAmount("", T)).toMatchObject({
            ok: false,
            reason: "empty",
        });
        expect(checkAmount("0", T)).toMatchObject({
            ok: false,
            reason: "zero",
            message: "Enter an amount above 0.",
        });
        expect(checkAmount("9000", T)).toMatchObject({
            ok: false,
            reason: "over",
            leftPaise: 840000,
            message:
                "₹9,000 is ₹600 more than what's left (₹8,400). Record ₹8,400.",
        });
    });

    it("the line under the amount and the button", () => {
        expect(amountHint("8400", T)).toBe(
            "All of what's left. Type less for a part payment.",
        );
        expect(amountHint("4000", T)).toBe(
            "₹4,400 stays to pay. The invoice reads “Partly paid”.",
        );
        expect(amountHint("9000", T)).toBeNull();
        expect(recordLabel("4000", "INR")).toBe("Record ₹4,000");
        expect(recordLabel("", "INR")).toBe("Record payment");
    });

    it("labels the reference by how it was paid", () => {
        expect(referenceWords("UPI").label).toBe("UPI reference");
        expect(referenceWords("BANK_TRANSFER").label).toBe("Bank reference");
        expect(referenceWords("CASH").label).toBe("Reference");
    });

    it("today, yesterday, or the day picked", () => {
        const now = new Date(2026, 9, 20, 15, 0);
        expect(receivedDate("today", undefined, now)).toBe(now);
        expect(receivedDate("yesterday", undefined, now)?.getDate()).toBe(19);
        expect(receivedDate("pick", undefined, now)).toBeNull();
        const picked = new Date(2026, 9, 12);
        expect(receivedDate("pick", picked, now)).toBe(picked);
    });

    it("says where the receipt goes", () => {
        expect(receiptNote("UPI", { ...T, emailTo: "v@example.com" })).toBe(
            "The receipt is emailed to v@example.com once Undo has passed.",
        );
        expect(receiptNote("UPI", T)).toContain("Share it on WhatsApp");
        expect(receiptNote("CHEQUE", { ...T, emailTo: "v@example.com" })).toBe(
            "The receipt is emailed to v@example.com once you mark the cheque as in the bank.",
        );
    });

    it("the Undo toast: part, full, cheque; the receipt only for what isn't a cheque", () => {
        const emailed = { ...T, emailTo: "v@example.com" };
        expect(
            recordedToast({
                paise: 400000,
                method: "CASH",
                target: emailed,
                leftAfter: "4400.00",
            }),
        ).toEqual({
            message: "₹4,000 recorded on RC/26-27/0106. ₹4,400 left.",
            description: "Receipt emailed to v@example.com",
        });
        expect(
            recordedToast({
                paise: 840000,
                method: "UPI",
                target: T,
                leftAfter: "0.00",
            }),
        ).toEqual({
            message: "₹8,400 recorded on RC/26-27/0106. Paid in full.",
        });
        expect(
            recordedToast({
                paise: 840000,
                method: "CHEQUE",
                target: emailed,
                leftAfter: "0.00",
            }),
        ).toEqual({
            message:
                "Cheque for ₹8,400 recorded on RC/26-27/0106. Not in the bank yet.",
        });
    });

    it("a cheque never clears before it was received", () => {
        const now = new Date(2026, 9, 20, 15, 0);
        const received = new Date(2026, 9, 20, 14, 0).toISOString();
        expect(clearedAtFor(new Date(2026, 9, 20), received, now)).toBe(now);
        const earlier = new Date(2026, 9, 19, 18, 0).toISOString();
        expect(
            clearedAtFor(new Date(2026, 9, 19), earlier, now).toISOString(),
        ).toBe(earlier);
        expect(
            clearedAtFor(
                new Date(2026, 9, 18),
                new Date(2026, 9, 17).toISOString(),
                now,
            ).getHours(),
        ).toBe(12);
    });

    it("the bounced sentence, overdue or not", () => {
        expect(
            bouncedLine({
                money: "₹8,400",
                number: "RC/26-27/0106",
                overdueSince: "7 Oct",
            }),
        ).toBe(
            "This removes the ₹8,400 payment. RC/26-27/0106 is owed again and shows as overdue (due 7 Oct).",
        );
        expect(
            bouncedLine({ money: "₹8,400", number: null, overdueSince: null }),
        ).toBe("This removes the ₹8,400 payment. The invoice is owed again.");
    });

    it("a target from a full read: what is left, and email only where it can go", () => {
        const base = {
            id: "inv_1",
            number: "RC/1",
            currency: "INR",
            total: "8400.00",
        } as Invoice;
        expect(paymentTargetOf(base, "Vivek")).toMatchObject({
            leftToPay: "8400.00",
            emailTo: null,
        });
        expect(
            paymentTargetOf(
                {
                    ...base,
                    leftToPay: "4400.00",
                    send: {
                        channels: ["email"],
                        emailTo: "v@example.com",
                        nextReminderAt: null,
                    },
                },
                "Vivek",
            ),
        ).toMatchObject({ leftToPay: "4400.00", emailTo: "v@example.com" });
    });
});
