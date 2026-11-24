import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { ACTIVE_ORG_COOKIE, getActiveOrgId } from "@/lib/api/http";
import { inReadScope, setScopedOrg } from "@/lib/api/read-scope";
import { ROLE_DENIED } from "@/lib/api/role-denied";
import { ORG_HEADER } from "@/lib/query/api-read";
import type { Read } from "@/lib/query/define-read";
import { toWire } from "@/lib/query/define-read";

/**
 * The one way to build a read route, `app/api/<area>/route.ts` (DEC-259):
 *
 *     export const dynamic = "force-dynamic";
 *     export const GET = readRoute({ read, service }, access);
 *     export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
 *
 * - Every answer, errors too, is `private, no-store` and varies by cookie;
 *   no CORS headers: same origin only.
 * - The business is the active one (`getActiveOrgId`), never one the
 *   browser names. The browser must say which it believes is open
 *   (`x-organization-id`, from its query key); any difference is a 409
 *   `org_mismatch` with no data, so a tab on business A never fills with B.
 * - Params pass a strict zod object: an unknown or repeated one is a 400.
 * - Bodies are a bare `{ code }`: no upstream message, id or stack. A
 *   missing or another business's record is a 404.
 *
 * No fire-and-forget work in a handler: a Worker invocation can end with
 * the response, and un-awaited work is then lost.
 */

/** A read's server side: its definition and the service that answers it. */
export interface ServerRead<P, T> {
    read: Read<P, T>;
    /** `null` is a 404: missing, or another business's. */
    service: (params: P) => Promise<T | null>;
}

/** The page's own gate, asked again here: false is a 403. */
export type Access = (orgId: string) => Promise<boolean>;

/** The longest query string a read takes: Print tickets' 50 order ids fit. */
const MAX_QUERY = 2048;

/** A list read's page size: capped. */
export const pageSize = z.coerce.number().int().min(1).max(100).optional();
/** A search: bounded. */
export const searchText = z.string().max(100).optional();

const HEADERS = {
    "cache-control": "private,no-store",
    vary: "Cookie",
};

function answer(status: number, body: unknown): Response {
    return Response.json(body, { status, headers: HEADERS });
}

const CODES: Record<number, string> = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "org_mismatch",
    429: "rate_limited",
    503: "unavailable",
};
const refuse = (status: number) => answer(status, { code: CODES[status] });

/** Every method but GET: a 405, with the same headers. */
const notAllowed = () => Promise.resolve(refuse(405));
export const NOT_ALLOWED = {
    POST: notAllowed,
    PUT: notAllowed,
    PATCH: notAllowed,
    DELETE: notAllowed,
    HEAD: notAllowed,
    OPTIONS: notAllowed,
};

/** Asked by a page of another site, or sent from one. */
function crossSite(headers: Headers): boolean {
    const site = headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return true;
    const origin = headers.get("origin");
    if (!origin) return false;
    const host = (headers.get("x-forwarded-host") ?? headers.get("host"))
        ?.split(",")[0]
        ?.trim();
    try {
        return new URL(origin).host !== host;
    } catch {
        return true;
    }
}

/** The status a failed service or gate answers with: generic, never its words. */
function statusOf(error: unknown): number {
    if (error instanceof ApiError) {
        return [400, 401, 403, 404, 429].includes(error.status)
            ? error.status
            : 503;
    }
    // Next's own interrupts: `forbidden()`, `notFound()`, `unauthorized()`
    // carry their status; a redirect means this isn't for them.
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string") {
        if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) {
            const status = Number(digest.split(";")[1]);
            return [401, 403, 404].includes(status) ? status : 403;
        }
        if (digest.startsWith("NEXT_REDIRECT")) return 403;
    }
    return 503;
}

/** One cookie's value from the request's own header. */
function cookieOf(headers: Headers, name: string | undefined): string | null {
    if (!name) return null;
    for (const part of (headers.get("cookie") ?? "").split(";")) {
        const at = part.indexOf("=");
        if (part.slice(0, at).trim() === name) {
            return decodeURIComponent(part.slice(at + 1).trim());
        }
    }
    return null;
}

function paramsOf(url: URL): Record<string, string> | null {
    if (url.search.length > MAX_QUERY) return null;
    const out = Object.fromEntries(url.searchParams);
    // A repeated param is one more entry than key.
    return Object.keys(out).length === url.searchParams.size ? out : null;
}

/** Next's second argument: a dynamic segment's values (`[productId]`). */
interface Segments {
    params?: Promise<Record<string, string | string[]>>;
}

export function readRoute<P, T>(
    def: ServerRead<P, T>,
    access?: Access,
): (request: Request, segments?: Segments) => Promise<Response> {
    const schema = z.strictObject(def.read.params);
    // One API answer per URL for the whole handler (`inReadScope`).
    return (request, segments) =>
        inReadScope(() => answerRead(request, segments));
    async function answerRead(
        request: Request,
        segments?: Segments,
    ): Promise<Response> {
        if (crossSite(request.headers)) return refuse(403);
        const query = paramsOf(new URL(request.url));
        const path = (await segments?.params) ?? {};
        // A segment named again in the query is refused, never overridden.
        const raw =
            query && Object.keys(path).every((k) => !(k in query))
                ? { ...query, ...path }
                : null;
        const parsed = raw && schema.safeParse(raw);
        if (!parsed?.success) return refuse(400);
        try {
            // The tab's claim matching the cookie settles the business without
            // the business list: the API refuses a non-member or a paused
            // seat on every call (403, which marks the tab's list stale).
            // Otherwise the list decides, and a difference is a 409.
            const claimed = request.headers.get(ORG_HEADER);
            const cookie = cookieOf(request.headers, ACTIVE_ORG_COOKIE);
            const orgId =
                claimed && claimed === cookie ? cookie : await getActiveOrgId();
            if (!orgId) return refuse(401);
            if (claimed !== orgId) return refuse(409);
            setScopedOrg(orgId);
            // The gate reads this request's membership, so its no is the
            // role's: the browser doesn't take it for a stale business list.
            if (access && !(await access(orgId))) {
                return answer(403, { code: ROLE_DENIED });
            }
            const data = await def.service(parsed.data as P);
            if (data === null) return refuse(404);
            return answer(200, toWire(data));
        } catch (error) {
            const status = statusOf(error);
            if (status === 503) console.error("read route failed", error);
            return refuse(status);
        }
    }
}
