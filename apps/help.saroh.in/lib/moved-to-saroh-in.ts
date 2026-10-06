/**
 * help.saroh.in moves to saroh.in/help (Resources plan U5, open question 4):
 * from the moment the new Help publishes, every request here is sent there
 * with a permanent redirect (308); before it, this site behaves as it always
 * has.
 *
 * The day mirrors Help's `publishOn` in `apps/saroh.in/content/resources.ts`
 * (and `HELP_PUBLISH_ON` in `content/help.ts`). It is copied, not imported:
 * that file belongs to another app. `moved-to-saroh-in.test.ts` reads both
 * and fails if they ever differ. Midnight in India (UTC+05:30, no daylight
 * saving), the same rule as saroh.in's `isPublished` (KTD-2).
 */
export const HELP_MOVES_ON = "2026-10-17";

/** The instant Help moves: midnight in India on `HELP_MOVES_ON`. */
export const HELP_MOVES_AT = new Date(`${HELP_MOVES_ON}T00:00:00+05:30`);

/** Production's marketing origin, when `MARKETING_URL` is unset. */
export const DEFAULT_MARKETING_URL = "https://www.saroh.in";

/**
 * The old pages with a clear match among the new articles. Every other
 * address (the welcome page, the broad guides, anything unknown) goes to
 * Help's home, `/help`, where the topics and search are.
 */
export const OLD_TO_NEW: Readonly<Record<string, string>> = {
    "/getting-started": "/help/create-your-business",
};

/** Whether Help has moved at `now`. */
export function helpHasMoved(now: Date): boolean {
    return now.getTime() >= HELP_MOVES_AT.getTime();
}

/** `/Selling/` and `/selling` are one page. */
function normalise(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, "").toLowerCase();
    return trimmed === "" ? "/" : trimmed;
}

/**
 * Where a request for `pathname` goes at `now`: the new page's absolute
 * address on `origin`, or null while this site still serves it.
 */
export function movedTo(
    pathname: string,
    now: Date,
    origin: string = DEFAULT_MARKETING_URL,
): string | null {
    if (!helpHasMoved(now)) return null;
    const base = origin.replace(/\/+$/, "");
    return `${base}${OLD_TO_NEW[normalise(pathname)] ?? "/help"}`;
}
