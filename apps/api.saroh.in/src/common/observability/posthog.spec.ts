// The API's door to PostHog (DEC-123), against a fake transport: no SDK
// client is ever made and nothing reaches a network.
const constructed: unknown[][] = [];
jest.mock("posthog-node", () => ({
    PostHog: class {
        capture = jest.fn();
        captureException = jest.fn();
        shutdown = jest.fn().mockResolvedValue(undefined);
        on = jest.fn();
        constructor(...args: unknown[]) {
            constructed.push(args);
        }
    },
}));

import {
    MAX_EXCEPTIONS_PER_HOUR,
    MAX_EXCEPTIONS_PER_MINUTE,
} from "@saroh/error-tracking";

import { structuredLogger } from "../logging/structured-logger";
import type { TelemetryTransport } from "./posthog";
import {
    captureProductEvent,
    flushTelemetry,
    installTelemetry,
    setTelemetry,
    telemetryOn,
} from "./posthog";
import { reportError, reportJobError } from "./report-error";

function fakeTransport() {
    return {
        capture: jest.fn(),
        captureException: jest.fn(),
        shutdown: jest.fn().mockResolvedValue(undefined),
    } satisfies TelemetryTransport;
}

const ctx = {
    correlationId: "req-1",
    statusCode: 500,
    method: "POST",
    url: "/organizations/cmf3k2x9w0001abcd1234efgh/orders?token=secret&email=a@b.in",
    route: "/organizations/:organizationId/orders",
    headers: { cookie: "session=abc", authorization: "Bearer abc" },
    organizationId: "cmf3k2x9w0001abcd1234efgh",
};

describe("PostHog in the API (DEC-123)", () => {
    beforeEach(() => {
        constructed.length = 0;
        jest.spyOn(structuredLogger, "error").mockImplementation(
            () => undefined,
        );
        jest.spyOn(structuredLogger, "warn").mockImplementation(
            () => undefined,
        );
        jest.spyOn(structuredLogger, "info").mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => {
        setTelemetry(null);
        jest.restoreAllMocks();
    });

    describe("without a key", () => {
        it("makes no client and sends nothing, whatever is reported", async () => {
            expect(
                installTelemetry({
                    key: undefined,
                    host: undefined,
                    environment: "production",
                }),
            ).toBe(false);
            expect(constructed).toEqual([]);
            expect(telemetryOn()).toBe(false);

            expect(() => {
                reportError(new Error("boom"), ctx);
                reportJobError(new Error("boom"), {
                    jobId: "j",
                    jobType: "t",
                    attempts: 1,
                });
                captureProductEvent("first_order_taken", "org_1", {});
            }).not.toThrow();
            await expect(flushTelemetry()).resolves.toBeUndefined();
            expect(constructed).toEqual([]);
        });

        it("stays off, and says so at ERROR, with a key but no environment", () => {
            expect(
                installTelemetry({
                    key: "phc_test",
                    host: undefined,
                    environment: undefined,
                }),
            ).toBe(false);
            expect(constructed).toEqual([]);
            expect(telemetryOn()).toBe(false);
            expect(structuredLogger.error).toHaveBeenCalledWith(
                "posthog_environment_missing",
                expect.any(Object),
            );
        });
    });

    it("makes one client for the EU host by default: no geoip, no flags, a short timeout", () => {
        expect(
            installTelemetry({
                key: "phc_test",
                host: undefined,
                environment: "development",
            }),
        ).toBe(true);
        expect(constructed).toEqual([
            [
                "phc_test",
                expect.objectContaining({
                    host: "https://eu.i.posthog.com",
                    disableGeoip: true,
                    enableExceptionAutocapture: false,
                    preloadFeatureFlags: false,
                    requestTimeout: 2_000,
                    fetchRetryCount: 1,
                }),
            ],
        ]);
        expect(telemetryOn()).toBe(true);
    });

    describe("errors", () => {
        it("sends a 5xx scrubbed: route template, ids, never headers, query or body", () => {
            const transport = fakeTransport();
            setTelemetry({ transport, environment: "production" });

            reportError(
                new Error("no contact asha@example.com at +91 98765 43210"),
                ctx,
            );

            expect(transport.captureException).toHaveBeenCalledTimes(1);
            const [error, distinctId, properties] = transport.captureException
                .mock.calls[0] as [Error, string, Record<string, unknown>];
            expect(error.name).toBe("Error");
            expect(error.message).toBe("no contact [email] at [number]");
            expect(error.stack).not.toContain("asha@example.com");
            // Counted against the business, by its internal id.
            expect(distinctId).toBe("cmf3k2x9w0001abcd1234efgh");
            expect(properties).toEqual({
                correlation_id: "req-1",
                status_code: 500,
                method: "POST",
                organization_id: "cmf3k2x9w0001abcd1234efgh",
                route: "/organizations/:organizationId/orders",
                app: "api",
                environment: "production",
                $process_person_profile: false,
            });
            const sent = JSON.stringify([
                error.message,
                error.stack,
                properties,
            ]);
            for (const leak of [
                "token=secret",
                "a@b.in",
                "session=abc",
                "Bearer abc",
            ])
                expect(sent).not.toContain(leak);
        });

        it("sends a job's last failure with its type", () => {
            const transport = fakeTransport();
            setTelemetry({ transport, environment: "development" });

            reportJobError(new Error("smtp down"), {
                jobId: "job_1",
                jobType: "enquiry.notify",
                organizationId: null,
                attempts: 5,
            });

            const [, distinctId, properties] = transport.captureException.mock
                .calls[0] as [Error, string, Record<string, unknown>];
            expect(distinctId).toBe("saroh-api");
            expect(properties).toMatchObject({
                job_type: "enquiry.notify",
                job_id: "job_1",
                correlation_id: "job_1",
                app: "api",
                environment: "development",
            });
        });

        it("stops forwarding past the per-process cap, and keeps logging", () => {
            const transport = fakeTransport();
            setTelemetry({ transport, environment: "production" });
            const burst = MAX_EXCEPTIONS_PER_MINUTE + 25;
            for (let i = 0; i < burst; i++)
                reportError(new Error(`boom ${i}`), ctx);
            expect(transport.captureException).toHaveBeenCalledTimes(
                MAX_EXCEPTIONS_PER_MINUTE,
            );
            expect(MAX_EXCEPTIONS_PER_HOUR).toBeGreaterThanOrEqual(
                MAX_EXCEPTIONS_PER_MINUTE,
            );
            const logged = (
                structuredLogger.error as jest.Mock
            ).mock.calls.filter(([name]) => name === "unhandled_exception");
            expect(logged).toHaveLength(burst);
        });

        it("never fails a request when the transport throws", () => {
            const transport = fakeTransport();
            transport.captureException.mockImplementation(() => {
                throw new Error("posthog down");
            });
            setTelemetry({ transport, environment: "production" });
            expect(() => reportError(new Error("boom"), ctx)).not.toThrow();
            expect(structuredLogger.warn).toHaveBeenCalledWith(
                "error_sink_failed",
                expect.any(Object),
            );
        });
    });

    describe("product events", () => {
        it("queues one event with ids and keys only, tagged with app and environment", () => {
            const transport = fakeTransport();
            setTelemetry({ transport, environment: "production" });

            captureProductEvent("first_order_taken", "org_1", {
                plan_key: "free",
                business_kind: "BUSINESS",
                // None of these may leave, whoever passes them.
                email: "asha@example.com",
                customerName: "Asha",
                phone: "+91 98765 43210",
                amount: 4500,
                address: "12 MG Road",
            });

            expect(transport.capture).toHaveBeenCalledWith({
                distinctId: "org_1",
                event: "first_order_taken",
                properties: {
                    plan_key: "free",
                    business_kind: "BUSINESS",
                    app: "api",
                    environment: "production",
                    $process_person_profile: false,
                },
            });
        });

        it("swallows a transport that throws", () => {
            const transport = fakeTransport();
            transport.capture.mockImplementation(() => {
                throw new Error("queue full");
            });
            setTelemetry({ transport, environment: "production" });
            expect(() =>
                captureProductEvent("signed_up", "user_1", {}),
            ).not.toThrow();
        });
    });
});
