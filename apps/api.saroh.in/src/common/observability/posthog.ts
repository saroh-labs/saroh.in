import type { TrackedEnvironment } from "@saroh/error-tracking";
import {
    createRateCap,
    MAX_EXCEPTIONS_PER_HOUR,
    MAX_EXCEPTIONS_PER_MINUTE,
    scrubContext,
    scrubMessage,
    scrubStack,
    scrubText,
    SEND_TIMEOUT_MS,
    trackingHost,
} from "@saroh/error-tracking";
import { PostHog } from "posthog-node";

import { structuredLogger } from "../logging/structured-logger";
import type { ErrorSink, ServerErrorEvent } from "./report-error";
import { setErrorSink } from "./report-error";

/**
 * The API's one door to PostHog (DEC-125): unhandled errors, and the
 * workspace's product milestones. Nothing else in the API imports the SDK.
 *
 * **Off without `POSTHOG_KEY`.** No client is made, nothing is queued, and
 * every function here returns at once.
 *
 * **Never in a request's way.** `capture` puts an event on the SDK's
 * in-memory queue and returns; the SDK sends batches in the background with
 * a {@link SEND_TIMEOUT_MS} timeout and one retry. PostHog being slow or
 * down costs a request nothing and fails nothing.
 *
 * **One project for development and production**, so every event carries
 * `environment` and `app: "api"`. The dev API also runs with
 * `NODE_ENV=production`, so the environment is never guessed from it:
 * `POSTHOG_ENVIRONMENT` says which, and with a key and no environment
 * nothing is sent (an ERROR is logged once at start-up).
 */

/** What the SDK is used for. Tests install a fake with {@link setTelemetry}. */
export interface TelemetryTransport {
    capture(message: {
        distinctId: string;
        event: string;
        properties: Record<string, unknown>;
    }): void;
    captureException(
        error: unknown,
        distinctId: string,
        properties: Record<string, unknown>,
    ): void;
    shutdown(timeoutMs?: number): Promise<void>;
}

interface Telemetry {
    transport: TelemetryTransport;
    environment: TrackedEnvironment;
    exceptions: { allow(): boolean };
}

let telemetry: Telemetry | null = null;

/** Whether anything is sent at all. Callers skip their own reads when not. */
export function telemetryOn(): boolean {
    return telemetry !== null;
}

/**
 * Install a transport (tests), or remove it with `null`. Also installs or
 * removes the error sink `reportError` forwards to.
 */
export function setTelemetry(
    next: {
        transport: TelemetryTransport;
        environment: TrackedEnvironment;
        exceptions?: { allow(): boolean };
    } | null,
): void {
    telemetry = next
        ? {
              transport: next.transport,
              environment: next.environment,
              // The per-process cap on exceptions sent
              // (MAX_EXCEPTIONS_PER_MINUTE, MAX_EXCEPTIONS_PER_HOUR).
              exceptions:
                  next.exceptions ??
                  createRateCap(
                      MAX_EXCEPTIONS_PER_MINUTE,
                      MAX_EXCEPTIONS_PER_HOUR,
                  ),
          }
        : null;
    setErrorSink(next ? errorSink : null);
}

/** Events queued before a batch is sent, and how often one is sent anyway. */
const FLUSH_AT = 20;
const FLUSH_INTERVAL_MS = 10_000;

/**
 * Called once at start-up. Returns whether PostHog is on.
 *
 * `key` is the project's public key (`phc_…`): it ships to browsers, so it
 * is a setting, not a secret.
 */
export function installTelemetry(config: {
    key: string | undefined;
    host: string | undefined;
    environment: TrackedEnvironment | undefined;
}): boolean {
    if (!config.key) return false;
    if (!config.environment) {
        // WARN would be missed. Volume: once per boot; any at all means the
        // host has POSTHOG_KEY without POSTHOG_ENVIRONMENT and nothing is
        // being reported.
        structuredLogger.error("posthog_environment_missing", {
            reason: "POSTHOG_KEY is set without POSTHOG_ENVIRONMENT (development | production). Nothing is sent.",
        });
        return false;
    }
    const client = new PostHog(config.key, {
        host: trackingHost(config.host),
        flushAt: FLUSH_AT,
        flushInterval: FLUSH_INTERVAL_MS,
        requestTimeout: SEND_TIMEOUT_MS,
        fetchRetryCount: 1,
        // The request comes from this server: its address says nothing.
        disableGeoip: true,
        // Errors arrive through `reportError` only, already scrubbed.
        enableExceptionAutocapture: false,
        // No feature flags: nothing is asked of PostHog, only told.
        preloadFeatureFlags: false,
    });
    client.on("error", (error: unknown) => {
        // A degraded path: PostHog refused or could not be reached. WARN;
        // a steady stream means the key or host is wrong, or PostHog is down.
        structuredLogger.warn("posthog_send_failed", {
            errorMessage:
                error instanceof Error
                    ? scrubMessage(error.message)
                    : "unknown",
        });
    });
    setTelemetry({
        transport: {
            capture: (message) => client.capture(message),
            captureException: (error, distinctId, properties) =>
                client.captureException(error, distinctId, properties),
            shutdown: (timeoutMs) => client.shutdown(timeoutMs),
        },
        environment: config.environment,
    });
    structuredLogger.info("posthog_on", { environment: config.environment });
    return true;
}

/** Send what is queued; called as the process stops. Never throws. */
export async function flushTelemetry(timeoutMs = 2_000): Promise<void> {
    try {
        await telemetry?.transport.shutdown(timeoutMs);
    } catch {
        // Stopping anyway.
    }
}

/** Who an API error is counted against when no business is known. */
const NO_ORGANIZATION = "saroh-api";

const errorSink: ErrorSink = {
    capture(event: ServerErrorEvent): void {
        const current = telemetry;
        if (!current) return;
        if (!current.exceptions.allow()) return;
        // A fresh Error from the already-scrubbed event: the SDK reads its
        // name, message and stack and can find nothing else on it.
        const error = new Error(scrubMessage(event.message));
        error.name = scrubText(event.name).slice(0, 100) || "Error";
        error.stack = event.stack
            ? scrubStack(event.stack)
            : `${error.name}: ${error.message}`;
        current.transport.captureException(
            error,
            event.organizationId ?? NO_ORGANIZATION,
            {
                ...scrubContext({
                    correlation_id: event.correlationId,
                    status_code: event.statusCode,
                    method: event.method,
                    organization_id: event.organizationId,
                    job_type: event.jobType,
                    job_id: event.jobId,
                }),
                // A template (`/orders/:orderId`), never the address asked for.
                ...(event.route ? { route: event.route } : {}),
                app: "api",
                environment: current.environment,
                $process_person_profile: false,
            },
        );
    },
};

/**
 * Send one product event. Fire-and-forget: queued in memory, sent in the
 * background, and a failure is swallowed. `properties` are scrubbed here
 * whatever the caller passed: ids, keys and counts only.
 */
export function captureProductEvent(
    event: string,
    distinctId: string,
    properties: Record<string, unknown>,
): void {
    const current = telemetry;
    if (!current) return;
    try {
        current.transport.capture({
            distinctId,
            event,
            properties: {
                ...scrubContext(properties),
                app: "api",
                environment: current.environment,
                // The business (or user) id is an id, not a person to profile.
                $process_person_profile: false,
            },
        });
    } catch (error) {
        structuredLogger.warn("posthog_send_failed", {
            errorMessage:
                error instanceof Error
                    ? scrubMessage(error.message)
                    : "unknown",
        });
    }
}
