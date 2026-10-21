/**
 * Remind many's words and groups (DEC-173, U12 #1124, INVBulkSend): step
 * 1's line, step 2's groups and button, and the tally at the end.
 */
import { describe, expect, it } from "vitest";

import type { ReminderRow } from "./remind-all";
import {
    cantReachWhy,
    chunks,
    emailOutcome,
    names,
    pickLine,
    sendLabel,
    tallyLine,
    waysHead,
    waysOf,
} from "./remind-many";

const row = (
    over: Partial<ReminderRow> & { invoiceId: string },
): ReminderRow => ({
    way: "EMAIL",
    reason: null,
    name: "Nikhil Rao",
    number: "RC/26-27/0135",
    leftToPay: "1800.00",
    currency: "INR",
    ...over,
});

describe("step 1", () => {
    it("says how many are shown and ticked, with what the ticked ones owe", () => {
        const shown = [
            { amountMinor: 840000, lateDays: 13 },
            { amountMinor: 180000, lateDays: 4 },
            { amountMinor: 48000, lateDays: 1 },
        ].map((r, i) => ({
            ...r,
            invoiceId: `i${i}`,
            name: "X",
            number: null,
            currency: "INR",
        }));
        expect(pickLine(shown, shown.slice(0, 2))).toBe(
            "3 overdue shown. Ticked: 2 · ₹10,200.",
        );
        expect(pickLine(shown, [])).toBe("3 overdue shown. Ticked: 0.");
    });
});

describe("step 2", () => {
    const preview = {
        message: null,
        invoices: [
            row({ invoiceId: "a", email: "nikhil@example.com" }),
            row({
                invoiceId: "b",
                way: "WHATSAPP",
                reason: "NO_EMAIL_ADDRESS",
                name: "Vivek Nair",
                phone: "+919845011234",
                leftToPay: "8400.00",
            }),
            row({
                invoiceId: "c",
                way: "WAIT",
                reason: "REMINDED_TODAY",
                name: "Tara Pillai",
                retryAt: "2026-10-21T00:00:00.000Z",
                leftToPay: "480.00",
            }),
            row({ invoiceId: "gone", way: "NONE", reason: "NOT_FOUND" }),
        ],
    } satisfies Parameters<typeof waysOf>[0];

    it("groups email, WhatsApp and can't reach, and never names an id that isn't the business's", () => {
        const ways = waysOf(preview);
        expect(ways.email.map((r) => r.invoiceId)).toEqual(["a"]);
        expect(ways.email[0]?.note).toBe("nikhil@example.com");
        expect(ways.whatsapp.map((r) => r.invoiceId)).toEqual(["b"]);
        expect(ways.whatsapp[0]?.note).toBe("No email address");
        expect(ways.cantReach.map((r) => r.invoiceId)).toEqual(["c"]);
        expect(ways.cantReach[0]?.waits).toBe(true);
        expect(ways.cantReach[0]?.note).toBe(
            "Reminded today. Next one tomorrow (one a day).",
        );
        expect(sendLabel(ways)).toBe("Send 1 email, then WhatsApp 1");
    });

    it("heads the step with INVShareB's one look", () => {
        const head = waysHead(waysOf(preview));
        expect(head.title).toBe("3 invoices · ₹10,680");
        expect(head.line).toBe(
            "1 goes by email now. WhatsApp opens for Vivek after, one tap each. Tara can't be reached now.",
        );
    });

    it("with no email of the business's own the button is WhatsApp alone", () => {
        const ways = waysOf({
            message: null,
            invoices: ["x", "y"].map((id) =>
                row({
                    invoiceId: id,
                    way: "WHATSAPP",
                    reason: "NO_EMAIL_PROVIDER",
                    phone: "+919845011234",
                }),
            ),
        });
        expect(ways.email).toEqual([]);
        expect(ways.noProvider).toBe(true);
        expect(sendLabel(ways)).toBe("WhatsApp 2");
        expect(ways.whatsapp[0]?.note).toBe("No email provider connected");
    });

    it("names why one can't be reached", () => {
        expect(
            cantReachWhy(
                row({ invoiceId: "z", way: "NONE", reason: "UNREACHABLE" }),
            ),
        ).toBe("No email or phone to reach them");
        expect(
            cantReachWhy(
                row({
                    invoiceId: "z",
                    way: "NONE",
                    reason: "UNREACHABLE",
                    emailBlocked: "NO_EMAIL_PROVIDER",
                }),
            ),
        ).toBe("No phone, and no email provider connected");
        expect(
            cantReachWhy(
                row({ invoiceId: "z", way: "NONE", reason: "AUTOPAY_PENDING" }),
            ),
        ).toBe("Autopay is taking it now");
        expect(sendLabel({ email: [], whatsapp: [] })).toBe("Nothing to send");
    });
});

describe("calls of at most 100", () => {
    it("splits 230 ids into 100, 100 and 30, in order", () => {
        const ids = Array.from({ length: 230 }, (_, i) => `i${i}`);
        const parts = chunks(ids);
        expect(parts.map((p) => p.length)).toEqual([100, 100, 30]);
        expect(parts.flat()).toEqual(ids);
    });
});

describe("the end", () => {
    it("sorts the send's answer: emailed, refused, and reminded since", () => {
        const out = emailOutcome({
            invoices: [
                { ...row({ invoiceId: "a" }), outcome: "EMAILED" },
                {
                    ...row({ invoiceId: "b", name: "Priya Raman" }),
                    outcome: "FAILED",
                    message: "No email provider",
                },
                {
                    ...row({
                        invoiceId: "c",
                        name: "Tara Pillai",
                        way: "WAIT",
                    }),
                    outcome: "FAILED",
                },
            ],
        });
        expect(out.emailed).toEqual(["Nikhil Rao"]);
        expect(out.failed).toEqual([
            { name: "Priya Raman", words: "No email provider" },
        ]);
        expect(out.waits).toEqual(["Tara Pillai"]);
    });

    it("tallies as the board says it", () => {
        expect(
            tallyLine({
                emailed: ["Nikhil Rao"],
                whatsapp: ["Vivek Nair"],
                skipped: [],
                waits: ["Tara Pillai"],
                cantReach: [],
                failed: [],
            }),
        ).toBe("1 emailed · 1 shared on WhatsApp · 1 waits until tomorrow");
        expect(
            names([
                "Nikhil Rao",
                "Anjali Bose",
                "Arjun Mehta",
                "Om P",
                "Lata I",
            ]),
        ).toBe("Nikhil, Anjali, Arjun and 2 more");
    });
});
