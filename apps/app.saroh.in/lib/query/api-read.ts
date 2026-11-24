import { ReadFailed } from "@/lib/query/client";

/** The header that says which business a read is for: its query key's. */
export const ORG_HEADER = "x-organization-id";

type Param = string | number | boolean | null | undefined;

/**
 * A read route, asked from the browser (DEC-259): same origin, the
 * business from the query key (never the cookie alone), and no following a
 * redirect, which only the sign-in gate sends.
 *
 * Never an empty answer for a failure: a non-2xx throws {@link ReadFailed},
 * which the screen shows as its failed state and the client answers app-wide
 * (`onReadError`): signed out (a redirect or 401) clears the cache and goes
 * to sign-in; `org_mismatch` (409) or a 403 marks the business list stale.
 */
export async function apiRead<T>(
    path: string,
    params: object,
    { orgId, signal }: { orgId: string; signal?: AbortSignal },
): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params) as [string, Param][]) {
        if (v !== undefined && v !== null) search.set(k, String(v));
    }
    const qs = search.toString();
    const res = await fetch(qs ? `${path}?${qs}` : path, {
        method: "GET",
        headers: { [ORG_HEADER]: orgId },
        credentials: "same-origin",
        redirect: "manual",
        signal,
    });
    if (
        res.type === "opaqueredirect" ||
        res.status === 401 ||
        (res.status >= 300 && res.status < 400)
    ) {
        throw new ReadFailed(401);
    }
    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
            code?: unknown;
        } | null;
        throw new ReadFailed(
            res.status,
            typeof body?.code === "string" ? body.code : undefined,
        );
    }
    return (await res.json()) as T;
}
