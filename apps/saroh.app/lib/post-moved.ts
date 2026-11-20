import { serverApiUrl, serverReadSignal } from "@/lib/api-url";
import { dontCachePage } from "@/lib/page-cache/site-rules";

/**
 * Where an old post link forwards (U17a): the post's live slug, or null.
 * Asked only after the post read missed, so a live post at the link always
 * wins. A failed read is a miss: the visitor gets the 404 they would have
 * had, and the page isn't kept.
 */
export async function postMovedTo(
    siteId: string,
    slug: string,
): Promise<string | null> {
    try {
        const res = await fetch(
            `${serverApiUrl()}/public/sites/${siteId}/posts/${encodeURIComponent(slug)}/moved`,
            {
                cache: "no-store",
                headers: { accept: "application/json" },
                signal: serverReadSignal(),
            },
        );
        if (res.status === 404) return null;
        const body = res.ok
            ? ((await res.json().catch(() => null)) as { to?: unknown } | null)
            : null;
        if (typeof body?.to === "string" && /^[a-z0-9-]+$/.test(body.to)) {
            return body.to;
        }
    } catch {
        // Below: not kept.
    }
    dontCachePage("post link lookup unavailable");
    return null;
}
