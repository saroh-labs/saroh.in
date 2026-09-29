import type { ModulePageStates } from "@saroh/site-blocks";

/**
 * Module pages on the live site (round-2 G15): a published page with a kind
 * (`BOOK`, `SHOP`, `PRICES`, `JOURNAL`, `CONTACT`; G14), and whether it
 * shows now.
 *
 * - `/book` and `/shop` are their own routes, and a Book or Shop page
 *   dresses them: the route draws the page's sections in place of its
 *   built-in listing. Deep links (`/book?service=`, `/shop/<product>`) go
 *   straight to the flow or the product.
 * - Prices, Journal and Contact pages are drawn by `[slug]`, at whatever
 *   address the merchant gave them.
 * - A module page whose module is off shows "This isn't available right
 *   now" with a link home, never a 404. With no module page, a route keeps
 *   today's behaviour.
 *
 * Whether a module is on comes from the public site read beside the
 * snapshot, so it follows the business live, without a republish. A kind
 * the read doesn't name shows: the renderer never guesses a module off.
 *
 * Pure, so the routes' choices are tested without a server.
 */

/** What these helpers need of a published page. */
export interface KindedPage {
    path: string;
    kind?: string | null;
}

/** `KIND` → `on` / `off`, from the public site read; absent before G15. */
export function modulePageStatesOf(value: unknown): ModulePageStates | null {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const out: ModulePageStates = {};
    for (const [kind, state] of Object.entries(
        value as Record<string, unknown>,
    )) {
        if (state === "on" || state === "off") out[kind] = state;
    }
    return out;
}

/**
 * A module route's name for its title: the published page's own title,
 * which is also its menu name, else the route's word. A blank title is no
 * title.
 */
export function moduleLabel(
    pages: readonly (KindedPage & { title?: string | null })[],
    kind: string,
    fallback: string,
): string {
    const title = findModulePage(pages, kind)?.title?.trim() ?? "";
    return title === "" ? fallback : title;
}

/** A free-form page: one with no kind, or `FREE`. */
export function isFreePage(page: KindedPage): boolean {
    return !page.kind || page.kind === "FREE";
}

/** The published page of a module kind, if the site has one. */
export function findModulePage<P extends KindedPage>(
    pages: readonly P[],
    kind: string,
): P | null {
    return pages.find((p) => p.kind === kind) ?? null;
}

/** Whether a page is a module page whose module is off now. */
export function moduleOff(
    page: KindedPage,
    modules: ModulePageStates | null | undefined,
): boolean {
    return !isFreePage(page) && modules?.[page.kind ?? ""] === "off";
}

/**
 * Where the account's "See plans" goes (G20): the site's published Prices
 * page, while its module is on. Null when the site has none, or it shows
 * "This isn't available right now".
 */
export function pricesPageHref(
    pages: readonly KindedPage[],
    modules: ModulePageStates | null | undefined,
): string | null {
    const page = findModulePage(pages, "PRICES");
    return page && !moduleOff(page, modules) ? page.path : null;
}

/**
 * What a module's own route draws (`/book`, `/shop`):
 * - `unavailable`: the site has that module page and its module is off;
 * - `page`: it has the page, the module is on, and the visit isn't a deep
 *   link into the flow;
 * - `builtin`: today's route — no module page, or a deep link.
 *
 * A deep link into a module that is off lands on `unavailable` too, so a
 * shared `/book?service=` link says why rather than failing inside the flow.
 */
export type ModuleRoute<P> =
    { draw: "unavailable" } | { draw: "page"; page: P } | { draw: "builtin" };

export function moduleRoute<P extends KindedPage>(
    pages: readonly P[],
    modules: ModulePageStates | null | undefined,
    kind: string,
    deepLink = false,
): ModuleRoute<P> {
    const page = findModulePage(pages, kind);
    if (!page) return { draw: "builtin" };
    if (moduleOff(page, modules)) return { draw: "unavailable" };
    return deepLink ? { draw: "builtin" } : { draw: "page", page };
}

/**
 * Whether `/book` was opened into the flow: a service, a day and time
 * (On today, G18), or a class to move (A6). Only a plain `/book` draws the
 * Book page.
 */
export function isBookingDeepLink(params: {
    service?: string | string[];
    date?: string | string[];
    start?: string | string[];
    move?: string | string[];
}): boolean {
    return [params.service, params.date, params.start, params.move].some(
        (v) => v !== undefined,
    );
}
