import { structuredLogger } from "../logging/structured-logger";
import {
    installErrorTracking,
    reportError,
    scrubMessage,
    setErrorSink,
    toServerErrorEvent,
} from "./report-error";

describe("reportError (#103)", () => {
    let logError: jest.SpyInstance;
    let logWarn: jest.SpyInstance;

    beforeEach(() => {
        logError = jest
            .spyOn(structuredLogger, "error")
            .mockImplementation(() => undefined);
        logWarn = jest
            .spyOn(structuredLogger, "warn")
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        setErrorSink(null);
        jest.restoreAllMocks();
    });

    const ctx = {
        correlationId: "req-1",
        statusCode: 500,
        method: "POST",
        url: "/organizations/org_1/orders?token=secret&email=a@b.in",
        headers: { cookie: "session=abc", "user-agent": "jest" },
        organizationId: "org_1",
    };

    it("logs every error, with redacted headers, and forwards nothing by default", () => {
        reportError(new Error("boom"), ctx);
        expect(logError).toHaveBeenCalledWith(
            "unhandled_exception",
            expect.objectContaining({
                correlationId: "req-1",
                errorMessage: "boom",
                headers: expect.objectContaining({ cookie: "[REDACTED]" }),
            }),
        );
    });

    it("gives a tracker the path, never the query, headers or a body", () => {
        const seen: unknown[] = [];
        setErrorSink({ capture: (e) => seen.push(e) });
        reportError(new Error("no contact asha@example.com"), ctx);
        expect(seen).toEqual([
            {
                name: "Error",
                message: "no contact [email]",
                stack: expect.any(String) as string,
                correlationId: "req-1",
                statusCode: 500,
                method: "POST",
                path: "/organizations/org_1/orders",
                organizationId: "org_1",
            },
        ]);
    });

    it("never fails the request when the tracker throws", () => {
        setErrorSink({
            capture: () => {
                throw new Error("tracker down");
            },
        });
        expect(() => reportError(new Error("boom"), ctx)).not.toThrow();
        expect(logWarn).toHaveBeenCalledWith(
            "error_sink_failed",
            expect.objectContaining({ errorMessage: "tracker down" }),
        );
    });

    it("scrubs emails, long numbers and bearer tokens, and caps the length", () => {
        expect(
            scrubMessage("pay 4111 1111 1111 1111 for x@y.co Bearer abc.def"),
        ).toBe("pay [number] for [email] Bearer [token]");
        expect(scrubMessage("y".repeat(700))).toHaveLength(500);
    });

    it("describes a thrown non-Error without stringifying it", () => {
        expect(
            toServerErrorEvent(
                { secret: 1 },
                { correlationId: "c", statusCode: 500 },
            ),
        ).toMatchObject({ message: "A non-Error value was thrown" });
    });

    it("stays off without a DSN, and says so rather than forwarding with one", () => {
        expect(installErrorTracking(undefined)).toBe(false);
        expect(logWarn).not.toHaveBeenCalled();
        expect(installErrorTracking("https://key@errors.example/1")).toBe(
            false,
        );
        expect(logWarn).toHaveBeenCalledWith(
            "error_tracking_not_installed",
            expect.any(Object),
        );
    });
});
