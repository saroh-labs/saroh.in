/**
 * Where an own post sends people (#1378, board SGOwnDesk's Link): Home,
 * the booking page, the shop, or one of the site's published pages, each
 * with its full address shown. What is stored is the path on the
 * business's own site (`linkPath`); the address is the live origin's.
 * Pure.
 */

export interface LinkChoice {
    /** "home", "book", "shop", or "page:<id>". */
    value: string;
    label: string;
    /** On the business's own site: "/", "/book", "/work-with-us". */
    path: string;
}

export interface LinkSources {
    /** The live links: each null while its page isn't live. */
    links: { site: string | null; shop: string | null; book: string | null };
    /** The live site's pages; null when the site isn't live. */
    pages:
        | readonly {
              id: string;
              path: string;
              title: string;
              isHome: boolean;
              hidden: boolean;
              kind?: string;
          }[]
        | null;
}

const pathOf = (url: string, origin: string): string => {
    try {
        const u = new URL(url);
        return u.origin === new URL(origin).origin ? u.pathname || "/" : "/";
    } catch {
        return "/";
    }
};

/** Home, Booking page, Shop: each only while live. */
export function fixedChoices(src: LinkSources): LinkChoice[] {
    const { site, shop, book } = src.links;
    if (!site) return [];
    const out: LinkChoice[] = [{ value: "home", label: "Home", path: "/" }];
    if (book) {
        out.push({
            value: "book",
            label: "Booking page",
            path: pathOf(book, site),
        });
    }
    if (shop)
        out.push({ value: "shop", label: "Shop", path: pathOf(shop, site) });
    return out;
}

/**
 * The site's own pages for "A page": shown ones that aren't home and aren't
 * a module's page (the shop and the booking page have their own rows).
 * shortcut: the live site's draft list stands in for its published pages,
 * so a page added since the last publish is offered too; read the live
 * publication's pages once the API lists them.
 */
export function pageChoices(src: LinkSources): LinkChoice[] {
    if (!src.links.site || !src.pages) return [];
    return src.pages
        .filter(
            (p) =>
                !p.hidden &&
                !p.isHome &&
                (p.kind === undefined || p.kind === "FREE") &&
                p.path.startsWith("/"),
        )
        .map((p) => ({ value: `page:${p.id}`, label: p.title, path: p.path }));
}

/** The full address a path opens, as the Link rows show it. */
export function addressOf(origin: string, path: string): string {
    return `${origin.replace(/\/+$/, "")}${path === "/" ? "" : path}`;
}

/** "rye-and-co.example.com/book": the address without its scheme. */
export const shownAddress = (url: string) => url.replace(/^https?:\/\//, "");
