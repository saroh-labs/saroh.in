import { afterEach, describe, expect, it, vi } from "vitest";

import {
    reportError,
    scrubMessage,
    setErrorReporter,
    toReport,
} from "./report-error";

afterEach(() => {
    setErrorReporter(null);
    vi.restoreAllMocks();
});

describe("reportError (#103)", () => {
    it("only logs while no tracker is registered", () => {
        const log = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        const error = new Error("boom");
        reportError(error, { boundary: "app/root" });
        expect(log).toHaveBeenCalledWith("[app/root]", error);
    });

    it("forwards a scrubbed report to a registered tracker", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const seen: unknown[] = [];
        setErrorReporter((r) => seen.push(r));
        reportError(new TypeError("no row for asha@example.com"), {
            boundary: "sites/domain",
            digest: "abc123",
        });
        expect(seen).toEqual([
            expect.objectContaining({
                boundary: "sites/domain",
                digest: "abc123",
                name: "TypeError",
                message: "no row for [email]",
            }),
        ]);
    });

    it("survives a tracker that throws", () => {
        const log = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        setErrorReporter(() => {
            throw new Error("tracker down");
        });
        expect(() =>
            reportError(new Error("x"), { boundary: "b" }),
        ).not.toThrow();
        expect(log).toHaveBeenCalledTimes(2);
    });

    it("masks emails, phone numbers and bearer tokens, and caps the length", () => {
        expect(
            scrubMessage(
                "call +91 98765 43210 or mail a.b@shop.in, Bearer eyJhbGciOi.x-y",
            ),
        ).toBe("call [number] or mail [email], Bearer [token]");
        expect(scrubMessage("x".repeat(900))).toHaveLength(500);
    });

    it("reports a thrown non-Error as a message", () => {
        expect(toReport("plain string", { boundary: "b" })).toMatchObject({
            name: "Error",
            message: "plain string",
        });
    });
});
