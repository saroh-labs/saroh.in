import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Header names we accept for an inbound correlation id, in priority order.
 * Lower-cased because Node/Express normalise incoming header keys.
 */
export const REQUEST_ID_HEADERS = ["x-request-id", "x-correlation-id"] as const;

/** Header we echo the correlation id back on so callers can log/trace it. */
export const RESPONSE_ID_HEADER = "X-Request-Id";

export interface RequestContext {
    correlationId: string;
}

/**
 * Carries the current request's correlation id across async boundaries so that
 * any log line (even deep inside a service) can be tagged without threading the
 * id through every function signature.
 */
export const correlationStorage = new AsyncLocalStorage<RequestContext>();

/** Correlation id of the in-flight request, or undefined outside a request. */
export function getCorrelationId(): string | undefined {
    return correlationStorage.getStore()?.correlationId;
}
