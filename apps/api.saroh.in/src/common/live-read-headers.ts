import type { Response } from "express";

/**
 * What a public live read answers with when it succeeds (review #4, #21):
 * the browser keeps nothing (`max-age=0`; the page reads it `no-store` as
 * well), and a shared cache in front of the API may keep it for what is
 * left of the API's own window (`LiveReadCache.secondsLeft`), so however
 * it is kept an answer is never more than 30 seconds old. The answer is
 * the same for every visitor and names nobody, so a shared copy is safe;
 * its CORS answer is "*" for the same reason (`EDGE_KEPT_READ`).
 *
 * Only a success is kept: the route's own `@Header("Cache-Control",
 * "no-store")` stays on a 404 or a 429, so one visitor's refusal is never
 * served to the next.
 */
export function liveReadCacheControl(seconds: number): string | null {
    return seconds > 0 ? `public, max-age=0, s-maxage=${seconds}` : null;
}

/** Mark a successful live read as one a shared cache may keep `seconds`. */
export function edgeMayKeep(res: Response, seconds: number): void {
    const header = liveReadCacheControl(seconds);
    if (header) res.setHeader("Cache-Control", header);
}
