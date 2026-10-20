/**
 * Remind all's words (Home plan U8): the sheet's lines, the bills group's
 * line while the reminders wait and after, and the toasts.
 */
import { describe, expect, it } from "vitest";

import type { ReminderRow } from "@/lib/invoices/remind-all";

import type { RemindAllPreview } from "./remind-all";
import {
    channelNote,
    fromPreview,
    fromResult,
    heldLine,
    heldToast,
    introWords,
    lateWords,
    minorOf,
    noneWords,
    remindLine,
    resultWords,
    sendLabel,
    skippedHeading,
    skipReasons,
} from "./remind-all";

const bill = {
    number: "RC/1",
    name: "Shruti Menon",
    amountMinor: 1125000,
    currency: "INR",
    lateDays: 29,
};

function preview(over: Partial<RemindAllPreview> = {}): RemindAllPreview {
    return {
        going: [{ ...bill, invoiceId: "a" }],
        skipped: [],
        people: 1,
        totals: [{ currency: "INR", amountMinor: 1125000 }],
        message: null,
        more: 0,
        ...over,
    };
}

const LINE = {
    title: "₹32,970 unpaid on 16 bills",
    sub: "10 overdue · the oldest is Shruti Menon's ₹11,250, 29 days",
    tag: { label: "10 overdue", tone: "bad" as const },
};

describe("Remind all's words", () => {
    it("says who owes what, one person or many, with money or without", () => {
        expect(introWords(preview())).toBe(
            "1 person owes ₹11,250 on an overdue bill.",
        );
        expect(
            introWords(
                preview({
                    people: 7,
                    going: Array.from({ length: 7 }, (_, i) => ({
                        ...bill,
                        invoiceId: `b${i}`,
                    })),
                    totals: [{ currency: "INR", amountMinor: 2373000 }],
                }),
            ),
        ).toBe("7 people owe ₹23,730 on overdue bills.");
        expect(introWords(preview({ totals: null }))).toBe(
            "1 person has an overdue bill to remind.",
        );
    });

    it("says how late, and the button's count", () => {
        expect(lateWords(29)).toBe("Late 29 days");
        expect(lateWords(1)).toBe("Late 1 day");
        expect(lateWords(0)).toBe("Late 1 day");
        expect(sendLabel(7)).toBe("Send 7 reminders");
        expect(sendLabel(1)).toBe("Send 1 reminder");
    });

    it("names each reason once, as the board does", () => {
        expect(skipReasons(["RECENT", "RECENT", "NO_WAY"])).toBe(
            "reminded in the last 3 days, or no way to reach them",
        );
        expect(skipReasons(["NO_PROVIDER", "NO_WAY"])).toBe(
            "no way to reach them",
        );
        expect(
            skippedHeading(
                preview({
                    skipped: [
                        {
                            ...bill,
                            invoiceId: "s",
                            reason: "RECENT",
                            why: "REMINDED_RECENTLY",
                            words: "Reminded yesterday",
                        },
                    ],
                }),
            ),
        ).toBe("1 skipped · reminded in the last 3 days");
        expect(skippedHeading(preview())).toBeNull();
    });

    it("says how it goes without promising WhatsApp", () => {
        expect(channelNote(preview())).toBe(
            "By email from your own address. Each person sees only their own bill.",
        );
        expect(
            channelNote(
                preview({
                    skipped: [
                        {
                            ...bill,
                            invoiceId: "w",
                            reason: "WHATSAPP",
                            why: "NO_EMAIL",
                            words: "No email address · WhatsApp from the bill",
                        },
                    ],
                }),
            ),
        ).toBe(
            "By email from your own address. Each person sees only their own bill. Anyone with only a phone number is below, to remind on WhatsApp from their bill.",
        );
    });

    it("says why nobody is reminded", () => {
        const skippedAll = (reason: "RECENT" | "NO_PROVIDER") =>
            preview({
                going: [],
                skipped: [
                    {
                        ...bill,
                        invoiceId: "s",
                        reason,
                        why:
                            reason === "NO_PROVIDER"
                                ? ("UNREACHABLE_NOT_CONNECTED" as const)
                                : ("REMINDED_RECENTLY" as const),
                        words:
                            reason === "NO_PROVIDER"
                                ? "No phone, and no email provider connected"
                                : "Reminded yesterday",
                    },
                ],
            });
        expect(noneWords(skippedAll("NO_PROVIDER")).connect).toBe(true);
        expect(noneWords(skippedAll("RECENT"))).toEqual({
            title: "No one to remind right now",
            body: "Everyone with an overdue bill was reminded in the last 3 days.",
            connect: false,
        });
    });

    it("says the hold, then the line while it waits and after", () => {
        expect(heldToast(7, 3)).toBe(
            "7 reminders go out in 10 seconds. 3 skipped.",
        );
        expect(heldToast(1, 0)).toBe("1 reminder goes out in 10 seconds.");
        expect(
            heldLine(LINE, {
                people: 7,
                skipped: 3,
                reasons: ["RECENT", "NO_WAY"],
            }),
        ).toEqual({
            title: LINE.title,
            sub: "Reminders going to 7 people · 3 skipped: reminded in the last 3 days, or no way to reach them",
            tag: { label: "Sending", tone: "info" },
        });
        expect(
            remindLine(LINE, {
                phase: "sent",
                people: 7,
                skipped: 3,
                reasons: [],
                sent: 7,
            }).sub,
        ).toBe("7 reminders sent today");
        expect(remindLine(LINE, undefined)).toBe(LINE);
    });

    it("names who the server skipped when they went", () => {
        expect(resultWords({ sent: [], skipped: [] })).toEqual({
            title: "No reminders were sent",
        });
        expect(
            resultWords({
                sent: [{ invoiceId: "a", name: "Priya" }],
                skipped: [
                    {
                        invoiceId: "b",
                        name: "Vivek Nair",
                        reason: "RECENT",
                        words: "Reminded today",
                    },
                ],
            }),
        ).toEqual({
            title: "1 reminder sent",
            body: "Skipped: Vivek Nair (reminded today).",
        });
    });

    it("reads Remind many's preview: email goes, the rest are skipped with why", () => {
        const row = (over: Partial<ReminderRow>): ReminderRow => ({
            invoiceId: "x",
            way: "EMAIL",
            reason: null,
            number: "RC/1",
            name: "Shruti Menon",
            leftToPay: "11250.00",
            currency: "INR",
            lateDays: 29,
            ...over,
        });
        const read = fromPreview(
            {
                invoices: [
                    row({ invoiceId: "a" }),
                    // The same person's second bill: one person.
                    row({ invoiceId: "b", leftToPay: "480.50" }),
                    row({
                        invoiceId: "c",
                        name: "Arjun Mehta",
                        way: "WAIT",
                        reason: "REMINDED_RECENTLY",
                        lastWords: "Reminded 2 days ago",
                    }),
                    row({
                        invoiceId: "d",
                        name: "Rahul Bose",
                        way: "NONE",
                        reason: "UNREACHABLE",
                        emailBlocked: "NO_EMAIL_ADDRESS",
                    }),
                    row({
                        invoiceId: "e",
                        name: "Kiran Rao",
                        way: "WHATSAPP",
                        reason: "EMAIL_OFF",
                        phone: "+919800000001",
                    }),
                    row({ invoiceId: "f", way: "NONE", reason: "PAID" }),
                    row({
                        invoiceId: "g",
                        way: "NONE",
                        reason: "AUTOPAY_PENDING",
                    }),
                    // Another business's id: never named back.
                    { invoiceId: "z", way: "NONE", reason: "NOT_FOUND" },
                ],
                message: "Hi Shruti,",
            },
            3,
        );
        expect(read.going.map((g) => g.invoiceId)).toEqual(["a", "b"]);
        expect(read.people).toBe(1);
        expect(read.totals).toEqual([
            { currency: "INR", amountMinor: 1173050 },
        ]);
        expect(read.message).toBe("Hi Shruti,");
        expect(read.more).toBe(3);
        expect(
            read.skipped.map((s) => [s.invoiceId, s.reason, s.words]),
        ).toEqual([
            ["c", "RECENT", "Reminded 2 days ago"],
            ["d", "NO_WAY", "No email or phone to reach them"],
            [
                "e",
                "WHATSAPP",
                "Turned off email from you · WhatsApp from the bill",
            ],
            ["f", "NOT_OVERDUE", "Paid already"],
            ["g", "AUTOPAY", "Autopay is taking it now"],
        ]);
    });

    it("has no totals when the amounts weren't sent", () => {
        const read = fromPreview({
            invoices: [
                { invoiceId: "a", way: "EMAIL", reason: null, name: "A" },
            ],
            message: null,
        });
        expect(read.totals).toBeNull();
        expect(read.going[0]?.amountMinor).toBeNull();
    });

    it("reads Send's answer: emailed, turned off since, waited, refused", () => {
        const base = { reason: null, name: "N" } as const;
        expect(
            fromResult({
                invoices: [
                    {
                        ...base,
                        invoiceId: "a",
                        way: "EMAIL",
                        outcome: "EMAILED",
                    },
                    {
                        ...base,
                        invoiceId: "b",
                        way: "EMAIL",
                        outcome: "SUPPRESSED",
                    },
                    {
                        ...base,
                        invoiceId: "c",
                        way: "WAIT",
                        reason: "REMINDED_TODAY",
                        outcome: "FAILED",
                        message: "One reminder a day.",
                    },
                    {
                        ...base,
                        invoiceId: "d",
                        way: "EMAIL",
                        outcome: "FAILED",
                        message: "This invoice is paid.",
                    },
                ],
            }),
        ).toEqual({
            sent: [{ invoiceId: "a", name: "N" }],
            skipped: [
                {
                    invoiceId: "b",
                    name: "N",
                    reason: "NO_WAY",
                    why: "EMAIL_OFF",
                    words: "Turned off email from you",
                },
                {
                    invoiceId: "c",
                    name: "N",
                    reason: "RECENT",
                    why: "REMINDED_TODAY",
                    words: "Reminded today. Next one tomorrow (one a day).",
                },
                {
                    invoiceId: "d",
                    name: "N",
                    reason: "FAILED",
                    words: "This invoice is paid.",
                },
            ],
        });
    });

    it("reads a Decimal string as minor units", () => {
        expect(minorOf("11250.00")).toBe(1125000);
        expect(minorOf("480.5")).toBe(48050);
        expect(minorOf("7")).toBe(700);
        expect(minorOf(undefined)).toBeNull();
        expect(minorOf("abc")).toBeNull();
    });
});
