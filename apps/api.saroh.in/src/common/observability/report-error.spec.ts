import { structuredLogger } from "../logging/structured-logger";
import {
    reportError,
    reportJobError,
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
                // No route matched: the path, with what looks like an id
                // replaced. `org_1` is too short to look like one.
                route: "/organizations/org_1/orders",
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

    it("gives a tracker the framework's route template when one matched", () => {
        const seen: unknown[] = [];
        setErrorSink({ capture: (e) => seen.push(e) });
        reportError(new Error("boom"), {
            ...ctx,
            route: "/organizations/:organizationId/orders",
        });
        expect(seen).toEqual([
            expect.objectContaining({
                route: "/organizations/:organizationId/orders",
            }),
        ]);
    });

    it("reports a job's last failure with its type and ids, and logs it at ERROR", () => {
        const seen: unknown[] = [];
        setErrorSink({ capture: (e) => seen.push(e) });
        reportJobError(new Error("send to +91 98765 43210 failed"), {
            jobId: "job_1",
            jobType: "booking.notify",
            organizationId: "org_1",
            attempts: 5,
        });
        expect(logError).toHaveBeenCalledWith(
            "job_failed_final",
            expect.objectContaining({
                jobId: "job_1",
                jobType: "booking.notify",
                attempts: 5,
                errorMessage: "send to [number] failed",
            }),
        );
        expect(seen).toEqual([
            {
                name: "Error",
                message: "send to [number] failed",
                stack: expect.any(String) as string,
                correlationId: "job_1",
                jobType: "booking.notify",
                jobId: "job_1",
                organizationId: "org_1",
            },
        ]);
    });

    it("logs a job's last failure and forwards nothing with no tracker", () => {
        expect(() =>
            reportJobError(new Error("x"), {
                jobId: "job_1",
                jobType: "t",
                attempts: 1,
            }),
        ).not.toThrow();
        expect(logError).toHaveBeenCalledWith(
            "job_failed_final",
            expect.any(Object),
        );
    });
});
