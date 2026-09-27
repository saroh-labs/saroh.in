import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
    cookies: vi.fn(),
    headers: vi.fn(),
}));

import {
    codeCallFailed,
    codeResult,
    optionsResult,
    sessionAnswer,
} from "./sign-in";

describe("codeCallFailed (review M-1)", () => {
    it("tells the customer the code couldn't be sent when this server can't sign the relay", () => {
        expect(codeCallFailed("unconfigured")).toEqual({
            ok: false,
            reason: "unavailable",
        });
        expect(codeCallFailed("unreachable")).toEqual({
            ok: false,
            reason: "error",
        });
    });
});

/**
 * What each of the API's sign-in answers means to the sheet (round-2 plan
 * A, A2/A3). The API's own text never passes through.
 */
describe("codeResult", () => {
    it("reads a sent code", () => {
        expect(
            codeResult(202, {
                sent: true,
                expiresInSeconds: 600,
                resendAfterSeconds: 30,
            }),
        ).toEqual({ ok: true, resendAfterSeconds: 30 });
    });

    it("reads the visitor's own limit and a shared wait, with their times", () => {
        expect(
            codeResult(429, {
                message: "Try again in 12 minutes",
                details: { reason: "limit", retryAfter: 700 },
            }),
        ).toEqual({ ok: false, reason: "limit", retryAfterSeconds: 700 });
        expect(
            codeResult(429, { details: { reason: "wait", retryAfter: 540 } }),
        ).toEqual({ ok: false, reason: "wait", retryAfterSeconds: 540 });
        // A 429 from a proxy, with no details, still waits.
        expect(codeResult(429, null)).toEqual({
            ok: false,
            reason: "limit",
            retryAfterSeconds: 60,
        });
    });

    it("reads a challenge request, with its key", () => {
        expect(
            codeResult(400, {
                details: { reason: "challenge", siteKey: "0x4AAA" },
            }),
        ).toEqual({ ok: false, reason: "challenge", siteKey: "0x4AAA" });
    });

    it("reads a code that couldn't be sent", () => {
        expect(codeResult(503, { details: { reason: "unavailable" } })).toEqual(
            { ok: false, reason: "unavailable" },
        );
    });

    it("reads a bad email, a closed business and anything else", () => {
        expect(
            codeResult(400, { message: ["email must be an email"] }),
        ).toEqual({ ok: false, reason: "email" });
        expect(codeResult(403, {})).toEqual({ ok: false, reason: "closed" });
        expect(codeResult(500, {})).toEqual({ ok: false, reason: "error" });
        expect(codeResult(401, {})).toEqual({ ok: false, reason: "error" });
    });
});

describe("sessionAnswer", () => {
    it("reads a new session", () => {
        expect(
            sessionAnswer(201, {
                token: "tok",
                expiresAt: "2026-10-27T10:00:00.000Z",
            }),
        ).toEqual({
            ok: true,
            token: "tok",
            expiresAt: new Date("2026-10-27T10:00:00.000Z"),
        });
        expect(sessionAnswer(201, { token: "tok" })).toEqual({
            ok: false,
            reason: "error",
        });
    });

    it("reads a wrong code and a dead one", () => {
        expect(sessionAnswer(400, { details: { reason: "invalid" } })).toEqual({
            ok: false,
            reason: "invalid",
        });
        expect(sessionAnswer(400, { details: { reason: "expired" } })).toEqual({
            ok: false,
            reason: "expired",
        });
    });

    it("reads a merged email, a blocked account and a limit", () => {
        expect(
            sessionAnswer(409, {
                details: { reason: "merged", signsInAs: "f•••@example.in" },
            }),
        ).toEqual({
            ok: false,
            reason: "merged",
            signsInAs: "f•••@example.in",
        });
        expect(
            sessionAnswer(403, {
                error: { statusCode: 403, details: { reason: "blocked" } },
            }),
        ).toEqual({ ok: false, reason: "blocked" });
        expect(
            sessionAnswer(429, {
                details: { reason: "limit", retryAfter: 90 },
            }),
        ).toEqual({ ok: false, reason: "limit", retryAfterSeconds: 90 });
        expect(sessionAnswer(502, null)).toEqual({
            ok: false,
            reason: "error",
        });
    });
});

describe("sessionAnswer — a business that isn't taking sign-ins (review A-7)", () => {
    it("reads a 403 without the blocked reason as closed, not as the customer blocked", () => {
        // The API's lifecycle gate: ORGANIZATION_NOT_ACTIVE, no details.
        expect(
            sessionAnswer(403, {
                error: {
                    code: "FORBIDDEN",
                    statusCode: 403,
                    message: "This business is suspended",
                },
            }),
        ).toEqual({ ok: false, reason: "closed" });
        expect(sessionAnswer(403, null)).toEqual({
            ok: false,
            reason: "closed",
        });
    });
});

describe("optionsResult", () => {
    it("reads the options, with a phone only when there is one", () => {
        expect(
            optionsResult({
                businessName: "Kavi Dental",
                phone: null,
                challenge: { required: false, siteKey: null },
            }),
        ).toEqual({
            businessName: "Kavi Dental",
            phone: null,
            challenge: { required: false, siteKey: null },
        });
        expect(
            optionsResult({
                businessName: "Kavi Dental",
                phone: "+91 80 4000 1234",
                challenge: { required: true, siteKey: "0x4AAA" },
            })?.phone,
        ).toBe("+91 80 4000 1234");
        expect(
            optionsResult({
                businessName: "Kavi Dental",
                phone: "  ",
                challenge: { required: false, siteKey: null },
            })?.phone,
        ).toBe(null);
    });

    it("refuses a shape it doesn't know", () => {
        expect(optionsResult(null)).toBe(null);
        expect(optionsResult({ businessName: "Kavi" })).toBe(null);
    });
});

/**
 * The API wraps every error in its envelope (`AllExceptionsFilter`):
 * `{ error: { code, message, statusCode, correlationId, details } }`. The
 * reasons live at `error.details`, and each one must still be read there
 * (A9: the booking page's sign-in runs against the real API).
 */
describe("answers in the API's error envelope", () => {
    const envelope = (status: number, details: Record<string, unknown>) => ({
        error: {
            code: "ERROR",
            message: "Words for Saroh, not for the customer",
            statusCode: status,
            correlationId: "cid_1",
            details,
        },
    });

    it("reads a challenge, a wait and a code that couldn't be sent", () => {
        expect(
            codeResult(
                400,
                envelope(400, { reason: "challenge", siteKey: "0x4AAA" }),
            ),
        ).toEqual({ ok: false, reason: "challenge", siteKey: "0x4AAA" });
        expect(
            codeResult(429, envelope(429, { reason: "wait", retryAfter: 540 })),
        ).toEqual({ ok: false, reason: "wait", retryAfterSeconds: 540 });
        expect(
            codeResult(503, envelope(503, { reason: "unavailable" })),
        ).toEqual({ ok: false, reason: "unavailable" });
    });

    it("tells a wrong code from an expired one, and reads a merge", () => {
        expect(
            sessionAnswer(400, envelope(400, { reason: "invalid" })),
        ).toEqual({ ok: false, reason: "invalid" });
        expect(
            sessionAnswer(400, envelope(400, { reason: "expired" })),
        ).toEqual({ ok: false, reason: "expired" });
        expect(
            sessionAnswer(409, envelope(409, { signsInAs: "f…@example.in" })),
        ).toEqual({ ok: false, reason: "merged", signsInAs: "f…@example.in" });
    });
});
