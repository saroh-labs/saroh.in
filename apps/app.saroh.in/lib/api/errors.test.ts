import { describe, expect, it } from "vitest";

import { ApiError, isDenial, statusFromError } from "./errors";

/**
 * What every permission-denied state in the app rests on (#287).
 *
 * A boundary decides between "you may not do this, and here is why" and
 * "something broke, try again" by reading a status back off a thrown error.
 * §30 asks for a denial to be EXPLAINED rather than presented as a breakage,
 * and a MEMBER told to "try again" is sent round a loop that cannot end.
 *
 * The recovery is a regex over a message, because Next does not hand a client
 * boundary the original object. That is a fragile mechanism holding up a
 * product rule, and it had no test at all.
 */

describe("ApiError", () => {
    it("keeps the status in the message, which is what survives serialization", () => {
        // Next serializes an error on its way to a client boundary, so the
        // instance is gone by the time anything reads it. The message is the
        // only carrier left — see statusFromError.
        expect(new ApiError(403, "GET /sites").message).toBe(
            "GET /sites failed: 403",
        );
    });

    it("keeps a caller's own message when given one", () => {
        expect(
            new ApiError(500, "GET /sites", "upstream is down").message,
        ).toBe("upstream is down");
    });

    it.each([
        [401, "isUnauthorized"],
        [403, "isForbidden"],
        [404, "isNotFound"],
    ] as const)("names %i as %s", (status, flag) => {
        const error = new ApiError(status, "GET /x");
        expect(error[flag]).toBe(true);
    });

    it("counts 5xx as ours, and 4xx as theirs", () => {
        // The distinction the retry button hangs on: a server failure is the
        // only class worth offering a retry for.
        expect(new ApiError(500, "GET /x").isServerError).toBe(true);
        expect(new ApiError(503, "GET /x").isServerError).toBe(true);
        expect(new ApiError(499, "GET /x").isServerError).toBe(false);
        expect(new ApiError(403, "GET /x").isServerError).toBe(false);
    });

    it("is an Error, so an untouched boundary still renders something", () => {
        const error = new ApiError(403, "GET /x");
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("ApiError");
        expect(error.path).toBe("GET /x");
    });
});

describe("statusFromError", () => {
    it("reads the status off the instance where it survives", () => {
        expect(statusFromError(new ApiError(403, "GET /sites"))).toBe(403);
    });

    it("recovers it from the message of a serialized error", () => {
        // What a client boundary actually receives in development.
        expect(statusFromError(new Error("GET /sites failed: 403"))).toBe(403);
    });

    it("returns null for a production digest, which is why 403 uses forbidden()", () => {
        /*
         * In a production build Next replaces a SERVER error's message with a
         * digest, so there is nothing to parse. That is not a gap to paper
         * over here — it is the reason `getJson` calls `forbidden()` on a 403
         * instead of throwing (#274). This test pins the limitation so nobody
         * "fixes" it by loosening the regex.
         */
        expect(statusFromError(new Error("Digest: 1004205865"))).toBeNull();
    });

    it.each([
        ["a string", "GET /sites failed: 403"],
        ["a plain object", { status: 403 }],
        ["null", null],
        ["undefined", undefined],
    ])("returns null for %s, rather than guessing", (_label, value) => {
        // Stringifying a non-Error yields "[object Object]", which never
        // matches and only invites the reader to think it might.
        expect(statusFromError(value)).toBeNull();
    });

    it("does not read a number that is not a status", () => {
        expect(statusFromError(new Error("failed: 40"))).toBeNull();
        expect(statusFromError(new Error("took 4032ms"))).toBeNull();
    });
});

describe("isDenial", () => {
    it("is true for the two the merchant can do nothing about", () => {
        expect(isDenial(new ApiError(401, "GET /x"))).toBe(true);
        expect(isDenial(new ApiError(403, "GET /x"))).toBe(true);
    });

    it("is false for a breakage, which is what a retry is for", () => {
        expect(isDenial(new ApiError(500, "GET /x"))).toBe(false);
        expect(isDenial(new ApiError(404, "GET /x"))).toBe(false);
        expect(isDenial(new Error("network"))).toBe(false);
    });
});
