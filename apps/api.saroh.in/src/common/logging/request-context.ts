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
    /** The request's method, for an error reported from outside Nest. */
    method?: string;
    /**
     * The path asked for, without its query string. It can still hold a
     * token (a password-reset link's), so it is reduced to a route's shape
     * before it is logged or sent anywhere.
     */
    path?: string;
    /** The client's address (`req.ip`, through the trusted proxies). */
    ip?: string;
    userAgent?: string;
    /** The signed-in session, set by `BetterAuthGuard`. */
    sessionId?: string;
    /** `requestMemo`'s answers, made on first use. */
    memo?: Map<string, Promise<unknown>>;
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

/** The in-flight request's id, method and path, or undefined outside one. */
export function getRequestContext(): RequestContext | undefined {
    return correlationStorage.getStore();
}

/**
 * One answer per key for the in-flight GET: a read that several parts of
 * one request ask for (the business's plan, asked per module) is read once.
 * Outside a request, or in any other method — a write may change what it
 * read before reading again — `load` runs every time. A failure isn't kept.
 */
export function requestMemo<T>(
    key: string,
    load: () => Promise<T>,
): Promise<T> {
    const store = correlationStorage.getStore();
    if (store?.method !== "GET") return load();
    store.memo ??= new Map();
    let answer = store.memo.get(key) as Promise<T> | undefined;
    if (!answer) {
        answer = load();
        store.memo.set(key, answer);
        answer.catch(() => store.memo?.delete(key));
    }
    return answer;
}
