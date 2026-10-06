import { describe, expect, it } from "vitest";

import { takesOnlinePayment } from "@/lib/billing/access";
import { offlinePlan, onlinePlan } from "@/lib/billing/fixtures.test-data";

import type { DiaryBooking } from "./booking-calendar";
import { paidLine } from "./booking-money";
import {
    deskButton,
    deskChange,
    deskChoices,
    deskInput,
    deskNote,
    deskProblem,
    deskTakenText,
    methodWord,
    paidAtDeskText,
} from "./desk-pay";
import { blockLine, paidText } from "./diary";

const rupees = (cents: number) => `₹${(cents / 100).toLocaleString("en-IN")}`;

describe("taking payment at the desk (P2)", () => {
    it("names each way it was taken, and says paid at the desk with how", () => {
        expect(methodWord("CASH")).toBe("Cash");
        expect(methodWord("UPI")).toBe("UPI");
        expect(methodWord("CARD")).toBe("Card");
        expect(methodWord("BANK_TRANSFER")).toBe("Bank transfer");
        expect(methodWord("ONLINE")).toBeNull();
        expect(paidAtDeskText("CARD")).toBe("Paid at the desk · Card");
        expect(paidAtDeskText(null)).toBe("Paid at the desk");
    });

    it("offers a link only for the whole booking, with a provider", () => {
        const off = (
            take: { cents: number; byLink: boolean },
            canLink: boolean,
        ) => deskChoices({ take, canLink }).find((c) => c.key === "LINK")?.off;
        expect(off({ cents: 50_000, byLink: true }, true)).toBeNull();
        expect(off({ cents: 40_000, byLink: false }, true)).toMatch(
            /take the rest here/,
        );
        expect(off({ cents: 50_000, byLink: true }, false)).toMatch(
            /Connect a payment provider/,
        );
        expect(
            deskChoices({ take: { cents: 1, byLink: true }, canLink: true })
                .filter((c) => c.key !== "LINK")
                .every((c) => c.off === null),
        ).toBe(true);
    });

    it("says what each way does and puts it on the button", () => {
        expect(deskButton("CASH", "₹500")).toBe("Take ₹500 cash");
        expect(deskButton("UPI", "₹500")).toBe("UPI received");
        expect(deskButton("CARD", "₹500")).toBe("Card approved");
        expect(deskButton("LINK", "₹500")).toBe("Get the pay link");
        expect(deskNote("UPI", "₹500")).toContain("₹500 shows on your UPI app");
        expect(deskNote("CARD", "₹500")).toContain("Key ₹500 into the machine");
    });

    it("works out the change, and stops cash that's short or not an amount", () => {
        expect(deskChange("1000", 50_000)).toEqual({
            kind: "change",
            cents: 50_000,
        });
        expect(deskChange("₹ 450", 50_000)).toEqual({
            kind: "short",
            cents: 5_000,
        });
        expect(deskChange("", 50_000)).toEqual({ kind: "none" });
        expect(deskProblem("CASH", "450", 50_000, rupees)).toBe(
            "That's ₹50 short.",
        );
        expect(deskProblem("CASH", "12.345", 50_000, rupees)).toBe(
            "Type the cash given as an amount.",
        );
        expect(deskProblem("CASH", "", 50_000, rupees)).toBeNull();
        expect(deskProblem("UPI", "450", 50_000, rupees)).toBeNull();
    });

    it("sends cash given only with cash", () => {
        expect(deskInput("CASH", 50_000, "1,000")).toEqual({
            method: "CASH",
            amountCents: 50_000,
            receivedCents: 100_000,
        });
        expect(deskInput("CASH", 50_000, "")).toEqual({
            method: "CASH",
            amountCents: 50_000,
        });
        expect(deskInput("UPI", 50_000, "1000")).toEqual({
            method: "UPI",
            amountCents: 50_000,
        });
    });

    it("says what was taken, and the change to give", () => {
        const paid = {
            invoiceId: "inv_1",
            number: "RC-0007",
            amountCents: 50_000,
            currency: "INR",
            method: "CASH" as const,
            changeCents: 20_000,
            replayed: false,
        };
        expect(deskTakenText(paid, rupees)).toBe(
            "₹500 taken in cash — give ₹200 change.",
        );
        expect(deskTakenText({ ...paid, changeCents: 0 }, rupees)).toBe(
            "₹500 taken in cash. The invoice is marked paid.",
        );
        expect(
            deskTakenText(
                { ...paid, method: "CARD", changeCents: null },
                rupees,
            ),
        ).toBe("₹500 taken by card. The invoice is marked paid.");
    });
});

describe("a booking paid at the desk, as the screens say it", () => {
    const money = {
        priceCents: 80_000,
        currency: "INR",
        paidOnlineCents: 0,
        deposit: false,
        dueCents: 0,
        refund: null,
    };

    it("booking page: the amount and how, after a deposit too", () => {
        expect(
            paidLine({ ...money, paidAtDeskCents: 80_000, deskMethod: "CASH" }),
        ).toBe("₹800 paid at the desk · Cash");
        expect(
            paidLine({
                ...money,
                paidOnlineCents: 40_000,
                deposit: true,
                paidAtDeskCents: 40_000,
                deskMethod: "CARD",
            }),
        ).toBe("Deposit ₹400 paid · ₹400 paid at the desk · Card");
        // An API before P2 sends none of it.
        expect(paidLine({ ...money, dueCents: 80_000 })).toBe(
            "₹800 due at the visit",
        );
    });

    const booking = {
        id: "bk_1",
        service: { name: "Check-up" },
        paidWith: "DESK",
        packName: null,
    } as unknown as DiaryBooking;

    it("calendar: the quick look's Paid row and the block's line", () => {
        expect(paidText(booking)).toBe("Pays at the session");
        const paid = { ...booking, paidAtDesk: { method: "UPI" } };
        expect(paidText(paid)).toBe("Paid at the desk · UPI");
        const block = (b: DiaryBooking) =>
            ({ kind: "one", booking: b, state: "booked" }) as Parameters<
                typeof blockLine
            >[0];
        expect(blockLine(block(booking))).toBe(
            "Check-up · pays at the session",
        );
        expect(blockLine(block(paid))).toBe("Check-up · paid at the desk");
    });
});

describe("Take ₹X's choices on each plan (R33)", () => {
    const take = { cents: 50_000, byLink: true };

    it("on a plan without online payments: the counter ways only, no link at all", () => {
        expect(
            deskChoices({
                take,
                canLink: false,
                online: takesOnlinePayment(offlinePlan()),
            }).map((c) => c.key),
        ).toEqual(["CASH", "UPI", "CARD"]);
    });

    it("on a plan with online payments: the link too", () => {
        expect(
            deskChoices({
                take,
                canLink: true,
                online: takesOnlinePayment(onlinePlan()),
            }).find((c) => c.key === "LINK"),
        ).toEqual({ key: "LINK", label: "Send a pay link", off: null });
    });
});
