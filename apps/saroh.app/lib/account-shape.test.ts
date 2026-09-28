import { describe, expect, it } from "vitest";

import {
    emailChangeAnswer,
    homeResult,
    isAccountView,
    isMessage,
    notesResult,
    receiptsResult,
    refusalMessage,
    threadResult,
} from "./account-shape";

/**
 * The account area's answers as this server reads them (round-2 plan A,
 * A5): a shape it doesn't know is never drawn, and a Home block that failed
 * or came back strange stays "couldn't be loaded", never "none".
 */

const ACCOUNT = {
    name: "Farah Khan",
    email: "farah@example.in",
    phone: null,
    businessName: "Kavi Dental",
    tabs: [
        { key: "home", label: "Home" },
        { key: "me", label: "Me" },
    ],
    offers: { appointments: true, orders: false, plans: false },
    bookingsLabel: "Appointments",
    healthNotes: false,
};

describe("isAccountView", () => {
    it("accepts the API's Me", () => {
        expect(isAccountView(ACCOUNT)).toBe(true);
    });

    it("refuses an unknown tab or a missing field", () => {
        expect(
            isAccountView({
                ...ACCOUNT,
                tabs: [{ key: "admin", label: "Admin" }],
            }),
        ).toBe(false);
        expect(isAccountView({ ...ACCOUNT, email: undefined })).toBe(false);
        expect(isAccountView({ ...ACCOUNT, offers: null })).toBe(false);
        expect(isAccountView(null)).toBe(false);
    });
});

describe("homeResult", () => {
    const booking = {
        ref: "bk_1",
        service: "Check-up",
        startAt: "2026-10-05T04:30:00.000Z",
        endAt: "2026-10-05T05:00:00.000Z",
        timezone: "Asia/Kolkata",
        staff: null,
        online: null,
    };

    it("keeps each block as it came", () => {
        expect(
            homeResult({
                nextBooking: { ok: true, value: booking },
                classes: { ok: true, value: null },
                orders: null,
                plan: { ok: false },
            }),
        ).toEqual({
            nextBooking: { ok: true, value: booking },
            classes: { ok: true, value: null },
            orders: null,
            plan: { ok: false },
        });
    });

    it("a block in a shape it doesn't know reads as failed, never as none", () => {
        const home = homeResult({
            nextBooking: { ok: true, value: { ...booking, startAt: 5 } },
            classes: { ok: true, value: { membership: "x", packs: [] } },
            orders: { ok: true, value: [{ ref: "o" }] },
            plan: "nope",
        });
        expect(home).toEqual({
            nextBooking: { ok: false },
            classes: { ok: false },
            orders: { ok: false },
            plan: { ok: false },
        });
        expect(homeResult(null)).toBe(null);
    });
});

describe("receipts and notes", () => {
    it("reads a list only when every row checks", () => {
        const row = {
            ref: "inv_1",
            number: "KD-0001",
            issuedAt: null,
            paidAt: "2026-09-02T00:00:00.000Z",
            total: "12000.00",
            currency: "INR",
        };
        expect(receiptsResult([row])).toEqual([row]);
        expect(receiptsResult([{ ...row, total: 12000 }])).toBe(null);
        const note = {
            ref: "n",
            text: "Blood thinners",
            sentAt: "2026-09-28T00:00:00.000Z",
            state: "SENT",
        };
        expect(notesResult([note])).toEqual([note]);
        expect(notesResult([{ ...note, state: "DRAFT" }])).toBe(null);
    });
});

describe("emailChangeAnswer", () => {
    it("reads each answer", () => {
        expect(emailChangeAnswer(200, { done: true })).toEqual({ ok: true });
        expect(
            emailChangeAnswer(400, {
                error: { details: { reason: "invalid" } },
            }),
        ).toEqual({ ok: false, reason: "invalid" });
        expect(emailChangeAnswer(400, null)).toEqual({
            ok: false,
            reason: "expired",
        });
        expect(
            emailChangeAnswer(429, {
                error: { details: { retryAfter: 42.2 } },
            }),
        ).toEqual({ ok: false, reason: "limit", retryAfterSeconds: 43 });
        expect(emailChangeAnswer(403, null)).toEqual({
            ok: false,
            reason: "closed",
        });
        expect(emailChangeAnswer(404, null)).toEqual({
            ok: false,
            reason: "error",
        });
    });
});

describe("refusalMessage", () => {
    it("passes on a field's message and the account area's own 409, nothing else", () => {
        expect(
            refusalMessage(
                400,
                {
                    error: {
                        message: "Validation failed",
                        details: ["Enter a phone number, like +91 98765 43210"],
                    },
                },
                "fallback",
            ),
        ).toBe("Enter a phone number, like +91 98765 43210");
        expect(
            refusalMessage(
                409,
                {
                    error: {
                        message: "The team hasn't read your last notes yet.",
                    },
                },
                "fallback",
            ),
        ).toBe("The team hasn't read your last notes yet.");
        expect(
            refusalMessage(
                500,
                { error: { message: "Internal server error" } },
                "fallback",
            ),
        ).toBe("fallback");
        expect(refusalMessage(400, null, "fallback")).toBe("fallback");
    });
});

describe("the message thread (A13)", () => {
    const THREAD = {
        messages: [
            {
                ref: "m1",
                from: "business",
                text: "Your crown is ready.",
                sentAt: "2026-10-04T09:00:00.000Z",
            },
            {
                ref: "m2",
                from: "me",
                text: "Thanks!",
                sentAt: "2026-10-04T10:00:00.000Z",
            },
        ],
        earlier: false,
    };

    it("reads the API's thread, and refuses one it doesn't know", () => {
        expect(threadResult(THREAD)).toEqual(THREAD);
        expect(threadResult({ messages: [], earlier: false })).toEqual({
            messages: [],
            earlier: false,
        });
        expect(
            threadResult({
                ...THREAD,
                messages: [{ ...THREAD.messages[0], from: "staff" }],
            }),
        ).toBe(null);
        expect(threadResult({ messages: THREAD.messages })).toBe(null);
        expect(threadResult(null)).toBe(null);
    });

    it("a message is exactly its four fields' kinds", () => {
        expect(isMessage(THREAD.messages[1])).toBe(true);
        expect(isMessage({ ...THREAD.messages[1], text: 3 })).toBe(false);
    });

    it("Me's unread count is read when sent, and optional from an older API", () => {
        expect(isAccountView({ ...ACCOUNT, unreadMessages: 2 })).toBe(true);
        expect(isAccountView({ ...ACCOUNT, unreadMessages: "2" })).toBe(false);
    });

    it("passes on the too-many sentence (429)", () => {
        expect(
            refusalMessage(
                429,
                {
                    error: {
                        message:
                            "You're sending messages quickly. Wait a minute, then try again.",
                    },
                },
                "fallback",
            ),
        ).toBe(
            "You're sending messages quickly. Wait a minute, then try again.",
        );
    });
});
