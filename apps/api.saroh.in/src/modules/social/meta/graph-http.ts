import { SocialMetaError } from "./social-meta.port";

/** How long one call to Meta may take. */
export const META_TIMEOUT_MS = 15_000;

export type FetchFn = typeof fetch;

/** Graph error codes that mean the token can't be used: reconnect. */
const AUTH_CODES = new Set([102, 190, 463, 467, 2500, 10]);
/** Rate and publishing limits. */
const LIMIT_CODES = new Set([4, 9, 17, 32, 341, 368, 613]);
/** Instagram's publishing limit reached (content_publishing_limit). */
const LIMIT_SUBCODES = new Set([2207042]);
/** The platform refused the picture: size, shape, format, or couldn't fetch it. */
const MEDIA_CODES = new Set([324, 36003, 36000, 36001]);
const MEDIA_SUBCODES = new Set([2207004, 2207005, 2207009, 2207026, 2207052]);
/** Meta's own trouble: try again. */
const RETRY_CODES = new Set([1, 2]);
const RETRY_SUBCODES = new Set([2207001, 2207003, 2207032]);

const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Meta's answer as an error Saroh acts on (U3): the HTTP status and Graph's
 * `error.code` / `error_subcode`. Keeps only numbers in `detail`: Meta's
 * message can quote what was sent.
 */
export function metaErrorOf(
    status: number,
    body: unknown,
    now: Date = new Date(),
): SocialMetaError {
    const e =
        body && typeof body === "object" && "error" in body
            ? ((body.error ?? {}) as Record<string, unknown>)
            : {};
    const code = num(e.code);
    const sub = num(e.error_subcode);
    const detail = `${status}:${code ?? "-"}${sub ? `/${sub}` : ""}`;
    if (sub !== null && LIMIT_SUBCODES.has(sub)) {
        return new SocialMetaError("limit", detail, hoursFrom(now, 24));
    }
    if (
        status === 401 ||
        (code !== null && (AUTH_CODES.has(code) || (code >= 200 && code < 300)))
    ) {
        return new SocialMetaError("auth", detail);
    }
    if (code !== null && LIMIT_CODES.has(code)) {
        return new SocialMetaError("limit", detail, hoursFrom(now, 1));
    }
    if (
        (code !== null && MEDIA_CODES.has(code)) ||
        (sub !== null && MEDIA_SUBCODES.has(sub))
    ) {
        return new SocialMetaError("media", detail);
    }
    if (
        status >= 500 ||
        status === 429 ||
        (code !== null && RETRY_CODES.has(code)) ||
        (sub !== null && RETRY_SUBCODES.has(sub))
    ) {
        return new SocialMetaError("retry", detail);
    }
    return new SocialMetaError("unknown", detail);
}

const hoursFrom = (now: Date, hours: number) =>
    new Date(now.getTime() + hours * 3_600_000);

/**
 * One call to Meta: JSON back, or a {@link SocialMetaError}. A dropped
 * connection or a timeout is `retry`. `token` goes in the Authorization
 * header (only the token exchanges carry one in the address, as Meta asks),
 * and no address or answer is ever logged.
 */
export async function metaCall<T>(
    fetchFn: FetchFn,
    url: string,
    init: {
        method?: "GET" | "POST" | "DELETE";
        token?: string;
        form?: Record<string, string>;
    } = {},
): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    let body: URLSearchParams | undefined;
    if (init.form) {
        body = new URLSearchParams(init.form);
        headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    let res: Response;
    try {
        res = await fetchFn(url, {
            method: init.method ?? (body ? "POST" : "GET"),
            headers,
            body,
            signal: AbortSignal.timeout(META_TIMEOUT_MS),
        });
    } catch (error) {
        throw new SocialMetaError(
            "retry",
            error instanceof Error ? error.name : "network",
        );
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw metaErrorOf(res.status, json);
    if (json === null || typeof json !== "object") {
        throw new SocialMetaError("retry", `${res.status}:unreadable`);
    }
    return json as T;
}

/** `?a=b&c=d` from an object, leaving out empty values. */
export function query(params: Record<string, string | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
}

/** Seconds from now as a date; Meta's `expires_in`. */
export function expiresIn(seconds: unknown, now: Date = new Date()): Date {
    const s =
        typeof seconds === "number" && seconds > 0 ? seconds : 60 * 86_400;
    return new Date(now.getTime() + s * 1000);
}
