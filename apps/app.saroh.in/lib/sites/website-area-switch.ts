import { env } from "@/env";

/**
 * Whether the redesigned Website area is shown (plan 2026-11-18-001, KTD-10):
 * All sites at `/sites`, and inside a site the site header, Overview and the
 * four groups. Only when `NEXT_PUBLIC_WEBSITE_AREA` is `on`; unset or
 * anything else is off, so a production build that leaves it out keeps
 * today's tabs exactly. Unset counts as on only under `next dev`; `off`
 * there checks today's screens. It hides; it protects nothing.
 *
 * Readers: `/sites`, the site layout (`[siteId]/(tabs)/layout.tsx`), the
 * Overview and Writing routes, the Posts tab's forward, Version history's
 * restore (`restoresAsDraft`), and the command
 * menu's site rows. Removed with today's `WebsiteHeader` once the area has
 * been on in production for a release (00-universal §15).
 */
export function websiteAreaOnFor(
    flag: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (flag) return flag === "on";
    return nodeEnv === "development";
}

/** {@link websiteAreaOnFor} for this build. Client-safe: both are public. */
export function websiteAreaOn(): boolean {
    return websiteAreaOnFor(env.NEXT_PUBLIC_WEBSITE_AREA, env.NODE_ENV);
}

/**
 * The one choice between the two restores (owner, 20 Nov 2026): on, a
 * version is restored as the draft (`restore-version.tsx`); off, it goes
 * live again as it always did (`versions/legacy/`).
 */
export function restoresAsDraft(): boolean {
    return websiteAreaOn();
}
