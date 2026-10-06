import type { PublishContext } from "@/content/resources";
import { helpLive } from "@/lib/help-live";

/**
 * help.saroh.in, served by this site (owner, 6 Oct): the old help app was
 * never deployed, so the domain points at the saroh.in project and every
 * request to it is sent here. The app's help links (`apps/app.saroh.in/lib/
 * help/links.ts`) and old bookmarks use it.
 *
 * - Once Help is shown (17 Oct, or a preview): to `/help`, or to the article
 *   an old page maps to.
 * - Before that: to the home page, since `/help` isn't published yet.
 *
 * The host keeps its environment: help.saroh.in goes to www.saroh.in and
 * help.saroh.io to www.saroh.io, so dev never sends anyone to production.
 */

/**
 * The old pages with a new article to start from: the same mapping the app's
 * help links use (`TOPIC_ARTICLE`; `help-host.test.ts` keeps them equal).
 * Every other old page goes to `/help`, where the topics and search are.
 */
export const OLD_TO_NEW: Readonly<Record<string, string>> = {
    "/getting-started": "/help/create-your-business",
    "/selling": "/help/add-your-first-product",
    "/bookings": "/help/set-your-teams-hours",
    "/website": "/help/connect-your-own-domain",
};

/** The `www.` host a `help.` host belongs to, or null for any other host. */
export function helpHostTarget(host: string | null): string | null {
    const name = host?.split(":")[0]?.toLowerCase() ?? "";
    return name.startsWith("help.")
        ? `www.${name.slice("help.".length)}`
        : null;
}

/** `/Selling/` and `/selling` are one page. */
function normalise(pathname: string): string {
    const trimmed = pathname.replace(/\/+$/, "").toLowerCase();
    return trimmed === "" ? "/" : trimmed;
}

/** The path on the `www.` host that `pathname` on a `help.` host goes to. */
export function helpHostPath(pathname: string, ctx: PublishContext): string {
    if (!helpLive(ctx)) return "/";
    return OLD_TO_NEW[normalise(pathname)] ?? "/help";
}
