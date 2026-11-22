import { cache } from "react";

import { apiFetch } from "@/lib/api/http";

/**
 * Whether the redesigned Website area is shown (plan 2026-11-18-001,
 * KTD-10): All sites at `/sites`, and inside a site the site header,
 * Overview, the four groups, the new editor and post editor.
 *
 * The api holds the one switch (`WEBSITE_AREA`, DEC-240) and this asks it,
 * once per request, so the app and the api can never disagree (a post held
 * for approval with no Send for approval to free it). An answer that can't
 * be read is off: today's screens, which the api also serves.
 *
 * Server-only (it reads through the API client). Server components await
 * it; client components read it from `useWebsiteArea()`
 * (`components/sites/website-area.tsx`), which the shell and the editor
 * layout fill from here. Removed with today's screens once the area has
 * been on in production for a release (00-universal §15).
 */
export const websiteAreaOn = cache(async (): Promise<boolean> => {
    try {
        const res = await apiFetch("/website-area");
        if (!res.ok) return false;
        return websiteAreaFrom(await res.json());
    } catch {
        return false;
    }
});

/** The api's answer: on only when it says so. */
export function websiteAreaFrom(body: unknown): boolean {
    return (body as { on?: unknown } | null)?.on === true;
}

/**
 * The one choice between the two restores (owner, 20 Nov 2026): on, a
 * version is restored as the draft (`restore-version.tsx`); off, it goes
 * live again as it always did (`versions/legacy/`).
 */
export function restoresAsDraft(): Promise<boolean> {
    return websiteAreaOn();
}
