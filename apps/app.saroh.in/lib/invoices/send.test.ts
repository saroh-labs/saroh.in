import { describe, expect, it } from "vitest";

import {
    canSend,
    sendConfirmLine,
    sendOutcome,
    sentLine,
    wasSent,
} from "./send";
import type { InvoiceSend, InvoiceSent } from "./service";

const email: InvoiceSend = {
    channels: ["email"],
    emailTo: "farah@example.com",
    nextReminderAt: null,
};
const thread: InvoiceSend = { channels: ["thread"], nextReminderAt: null };
const both: InvoiceSend = { ...email, channels: ["email", "thread"] };

const sent = (over: Partial<InvoiceSent> = {}): InvoiceSent => ({
    id: "m_1",
    channel: "email",
    to: "farah@example.com",
    at: "2026-09-03T05:00:00Z",
    reminder: false,
    status: "SENT",
    ...over,
});

describe("canSend / wasSent", () => {
    it("offers Send only when the API names a channel", () => {
        expect(canSend(email)).toBe(true);
        expect(
            canSend({
                channels: [],
                reason: "NO_EMAIL_PROVIDER",
                nextReminderAt: null,
            }),
        ).toBe(false);
        // An API from before D17 sends no flag: no Send.
        expect(canSend(undefined)).toBe(false);
    });

    it("counts a send that went, not one that was suppressed or failed", () => {
        expect(wasSent([sent()])).toBe(true);
        expect(wasSent([sent({ status: "QUEUED" })])).toBe(true);
        expect(
            wasSent([
                sent({ status: "SUPPRESSED" }),
                sent({ status: "FAILED" }),
            ]),
        ).toBe(false);
        expect(wasSent(undefined)).toBe(false);
    });
});

describe("sendConfirmLine", () => {
    it("says where it goes, and that the old link stops, for email", () => {
        expect(sendConfirmLine(email, "Farah", "₹2,400.00", false)).toBe(
            "This tells Farah by email at farah@example.com about ₹2,400.00, with a new pay link. A link you shared before stops working.",
        );
    });

    it("the account thread alone mints no new link", () => {
        expect(sendConfirmLine(thread, "Farah", "₹2,400.00", true)).toBe(
            "This reminds Farah in their account on your site that ₹2,400.00 is still to pay, with a way to pay it.",
        );
    });

    it("names both when both carry it", () => {
        expect(sendConfirmLine(both, "Farah", "₹2,400.00", false)).toContain(
            "by email at farah@example.com and in their account on your site",
        );
    });
});

describe("sendOutcome", () => {
    it("says where it was sent", () => {
        expect(
            sendOutcome(
                {
                    channels: ["email"],
                    email: { status: "QUEUED", to: "farah@example.com" },
                    thread: false,
                },
                "Farah",
                false,
            ),
        ).toEqual({
            ok: true,
            message: "Sent to farah@example.com with a pay link.",
        });
        expect(
            sendOutcome(
                { channels: ["thread"], email: null, thread: true },
                "Farah",
                true,
            ).message,
        ).toBe("Posted to Farah's account.");
    });

    it("says why nothing went when email is turned off", () => {
        const out = sendOutcome(
            {
                channels: ["email"],
                email: { status: "SUPPRESSED", to: "farah@example.com" },
                thread: false,
            },
            "Farah",
            false,
        );
        expect(out.ok).toBe(false);
        expect(out.message).toMatch(
            /^Not sent: Farah has turned off email from you\./,
        );
    });
});

describe("sentLine", () => {
    it.each([
        [sent(), "Sent to farah@example.com"],
        [sent({ reminder: true }), "Reminder sent to farah@example.com"],
        [
            sent({ status: "SUPPRESSED" }),
            "Invoice not sent to farah@example.com: they've turned off email from you",
        ],
        [
            sent({ status: "FAILED", reminder: true }),
            "Reminder to farah@example.com didn't go: the email provider refused it",
        ],
    ])("%#", (s, line) => {
        expect(sentLine(s)).toBe(line);
    });
});
