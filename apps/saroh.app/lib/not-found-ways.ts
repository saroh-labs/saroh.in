import type { ModulePageStates } from "@saroh/site-blocks";

import { findModulePage, moduleOff } from "./module-pages";

/**
 * The second way on from a site's 404 (the first is always "Back to home").
 *
 * - the shop, while `/shop` serves (the API's answer, read once per request
 *   by the layout), since a visitor who came to buy keeps browsing there;
 * - else the site's Contact page, while it shows (G15), or a free-form page
 *   at `/contact`, since someone who followed a broken link can still ask;
 * - else nothing: a 404 never offers a page the site doesn't have.
 *
 * Pure, so the choice is tested without a server.
 */
export interface NotFoundWay {
    href: string;
    label: string;
}

export function notFoundSecondary({
    pages,
    modules,
    shopServes,
}: {
    pages: readonly { path: string; kind?: string | null }[];
    modules: ModulePageStates | null | undefined;
    shopServes: boolean;
}): NotFoundWay | null {
    if (shopServes) return { href: "/shop", label: "Browse the shop" };

    const contact =
        findModulePage(pages, "CONTACT") ??
        pages.find((p) => p.path.replace(/\/+$/, "") === "/contact") ??
        null;
    if (contact && !moduleOff(contact, modules)) {
        return { href: contact.path, label: "Contact us" };
    }
    return null;
}
