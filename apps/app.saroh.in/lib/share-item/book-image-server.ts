import { apiFetch, orgBase } from "@/lib/api/http";

/** What the booking card's address may carry on to the API; nothing else. */
export const BOOK_IMAGE_PARAMS = [
    "style",
    "size",
    "bg",
    "fg",
    "w",
    "headline",
] as const;

/**
 * The booking page's card with the headline typed in the share sheet
 * (#1375), from the API's signed-in route (`…/share/book/image`), for the
 * app's own image route. Server-only: `apiFetch` forwards the session and
 * the active business, so the browser never names one, and a headline is
 * never part of a public picture's address.
 */
export async function getBookImage(
    search: URLSearchParams,
): Promise<Response | null> {
    const base = await orgBase();
    if (!base) return null;
    const q = new URLSearchParams();
    for (const key of BOOK_IMAGE_PARAMS) {
        const value = search.get(key);
        if (value !== null) q.set(key, value);
    }
    return apiFetch(`${base}/share/book/image?${q.toString()}`);
}
