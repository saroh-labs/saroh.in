import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
    cookies: vi.fn(),
    headers: vi.fn(),
}));

import { codeResult, optionsResult, sessionAnswer } from "./sign-in";

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
        expect(sessionAnswer(403, {})).toEqual({
            ok: false,
            reason: "blocked",
        });
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
