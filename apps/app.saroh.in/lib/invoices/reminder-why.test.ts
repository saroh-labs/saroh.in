/**
 * One wording for why a reminder doesn't go by email (review #30): Remind
 * many and Home's Remind all say the same thing for the same row, and Home
 * decides on the reason's code, never on its words.
 */
import { describe, expect, it } from "vitest";

import { fromPreview, noneWords, skipOf } from "@/lib/home/remind-all";

import type { ReminderRow } from "./remind-all";
import { cantReachWhy, whatsappWhy } from "./remind-many";
import { reminderWhy, reminderWhyCode } from "./reminder-why";

const row = (over: Partial<ReminderRow>): ReminderRow => ({
    invoiceId: "inv_1",
    way: "NONE",
    reason: null,
    name: "Vivek Nair",
    number: "RC/0106",
    leftToPay: "480.00",
    currency: "INR",
    ...over,
});

const ROWS: ReminderRow[] = [
    row({ way: "WHATSAPP", reason: "NO_EMAIL_PROVIDER", phone: "+91" }),
    row({ way: "WHATSAPP", reason: "EMAIL_OFF", phone: "+91" }),
    row({ way: "WHATSAPP", reason: "NO_EMAIL_ADDRESS", phone: "+91" }),
    row({ way: "WAIT", reason: "REMINDED_TODAY" }),
    row({
        way: "WAIT",
        reason: "REMINDED_RECENTLY",
        lastWords: "Reminded yesterday",
    }),
    row({ way: "NONE", reason: "AUTOPAY_PENDING" }),
    row({
        way: "NONE",
        reason: "UNREACHABLE",
        emailBlocked: "NO_EMAIL_PROVIDER",
    }),
    row({ way: "NONE", reason: "UNREACHABLE", emailBlocked: "EMAIL_OFF" }),
    row({ way: "NONE", reason: "UNREACHABLE" }),
    row({ way: "NONE", reason: "PAID" }),
];

describe("one wording for every screen", () => {
    it.each(ROWS)("Remind many and Remind all say the same: %o", (r) => {
        const many = r.way === "WHATSAPP" ? whatsappWhy(r) : cantReachWhy(r);
        const home = skipOf(r);
        expect(many).toBe(reminderWhy(r)?.words);
        expect(home?.words.startsWith(many ?? "")).toBe(true);
        expect(home?.why).toBe(reminderWhyCode(r));
    });

    it("by email: no reason on either screen", () => {
        const r = row({ way: "EMAIL", email: "v@example.com" });
        expect(reminderWhy(r)).toBeNull();
        expect(skipOf(r)).toBeNull();
        expect(cantReachWhy(r)).toBeNull();
    });
});

describe("Home's Remind all decides on the code", () => {
    it("asks to connect email when every one skipped is for want of a provider", () => {
        const read = fromPreview({
            message: null,
            invoices: [
                row({
                    invoiceId: "a",
                    way: "WHATSAPP",
                    reason: "NO_EMAIL_PROVIDER",
                    phone: "+91",
                }),
                row({
                    invoiceId: "b",
                    way: "NONE",
                    reason: "UNREACHABLE",
                    emailBlocked: "NO_EMAIL_PROVIDER",
                }),
            ],
        });
        expect(noneWords(read).connect).toBe(true);
    });

    it("words that read like it, on another reason, don't ask to connect", () => {
        const read = fromPreview({
            message: null,
            invoices: [row({ way: "NONE", reason: "UNREACHABLE" })],
        });
        const reworded = {
            ...read,
            skipped: read.skipped.map((s) => ({
                ...s,
                words: "No email provider connected",
            })),
        };
        expect(noneWords(reworded).connect).toBe(false);
    });
});
