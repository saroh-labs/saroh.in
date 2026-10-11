import { withoutShadowedInPageEntries } from "@saroh/block-contract";

import type { SiteNavItem } from "./site-header-menu";
import { trimTrailingSlashes } from "./url-path";

/**
 * The site's menu, worked out once for the header and the footer: which
 * entries show now, and where each one goes. Pure, and free of
 * `"use client"`, so both are drawn from it on the server.
 */

/**
 * Whether each module page shows now (G15), by kind (`BOOK`, `SHOP`, …), as
 * the public site read says: `off` while its module is switched off or not
 * rolled out for the business.
 */
export type ModulePageStates = Partial<Record<string, "on" | "off">>;

/**
 * The menu the header draws (G15), from the published navigation.
 *
 * - An entry for a module page whose module is `off` leaves the menu. One
 *   whose state isn't known stays: the site never guesses a module off, as
 *   the workspace's module gate fails open.
 * - **Home leads a menu made of module pages alone.** A site with no menu of
 *   its own publishes one of its module pages only (G14), which reads as
 *   "Book · Prices · Journal" with no way back but the name. The design's
 *   menu always starts at Home, so it is put in front:
 *   "Home · Book · Prices · Journal · Contact". (Home is never a module
 *   page, so it can't already be there.) It is not added while nothing else
 *   is listed: Home alone is no menu.
 * - **The menu follows the modules (G19).** This is the one place a menu
 *   entry is gated: the published navigation keeps every module page, each
 *   carrying its kind, and the live read says which are on, so turning a
 *   module off (or back on) changes the menu without a republish. The
 *   header's main button follows the same modules (`headerAction` in
 *   saroh.app), so "Order" goes with Shop. A menu left holding only Home
 *   once its module pages are off is no menu either.
 *
 * A menu with a free-form entry is the merchant's own and keeps its shape,
 * less any module page that is off; a menu without module pages comes back
 * exactly as it was published, so an existing site's header doesn't change.
 */
export function siteMenu(
    navigation: readonly SiteNavItem[],
    modules?: ModulePageStates | null,
): SiteNavItem[] {
    const shown = navigation.filter(
        (item) => !item.kind || modules?.[item.kind] !== "off",
    );
    // A menu that was "Home · Shop" is Home alone once Commerce is off
    // (G19), and Home alone is no menu. One the merchant published as
    // Home alone is theirs, and is drawn as it was.
    if (shown.length < navigation.length && shown.every(isHome)) return [];
    const moduleOnly =
        navigation.length > 0 && navigation.every((item) => item.kind);
    if (!moduleOnly || shown.length === 0) return shown;
    return [{ label: "Home", href: "/" }, ...shown];
}

/** The shop's address, and its menu entry. */
const SHOP_HREF = "/shop";

/**
 * The menu with a Shop entry when the shop serves (P4, G13's wiring): the
 * layout passes `shopServes` from the catalogue read `/shop` draws, so the
 * entry is there exactly when `/shop` is. A menu that already opens `/shop`
 * (a Shop page the merchant added, G14) keeps it as it is. Otherwise Shop
 * goes after Home, as the design's menu reads ("Home · Shop · …"), and a
 * site with no menu gets "Home · Shop". Not serving: the menu as it was.
 */
export function withShopLink(
    menu: readonly SiteNavItem[],
    shopServes: boolean,
): SiteNavItem[] {
    if (!shopServes) return [...menu];
    const opensShop = (item: SiteNavItem) =>
        item.kind === "SHOP" ||
        trimTrailingSlashes(item.href).toLowerCase() === SHOP_HREF;
    if (menu.some(opensShop)) return [...menu];
    const shop: SiteNavItem = { label: "Shop", href: SHOP_HREF, kind: "SHOP" };
    if (menu.length === 0) return [{ label: "Home", href: "/" }, shop];
    // After Home and the home page's own sections, which lead the menu.
    let at = menu[0] && isHome(menu[0]) ? 1 : 0;
    while (menu[at] && isInPage(menu[at])) at++;
    return [...menu.slice(0, at), shop, ...menu.slice(at)];
}

/** An entry that opens the home page: "/" (or "", as a page path can be). */
function isHome(item: SiteNavItem): boolean {
    return item.href === "/" || item.href === "";
}

/** An entry that jumps to a section of the home page (`/#visit`). */
function isInPage(item: SiteNavItem): boolean {
    return item.href.startsWith("/#");
}

/**
 * A link's address under a prefix: "" on a live site. A draft preview
 * (#198) lives under /preview/<token>, and a menu that pointed at "/about"
 * would drop the reviewer out of the preview onto the live site, or a 404.
 */
export function underBasePath(basePath: string, href: string): string {
    if (!basePath || !href.startsWith("/")) return href;
    // A section of the home page (`/#visit`): the preview's own home, with
    // the anchor, never "/preview/<token>/#visit".
    if (href.startsWith("/#")) return `${basePath}${href.slice(1)}`;
    return `${basePath}${href}`;
}

/**
 * Every entry the site's menu holds now, in order, before any address is
 * prefixed: the modules that are off are out, a section entry its page
 * entry names is out (`withoutShadowedInPageEntries`: it stands in for its
 * module page only while that page is out of the menu), and Shop is in
 * while the shop serves. The footer lists these; the header lists them less
 * the page its main button opens.
 */
export function siteMenuEntries({
    navigation,
    modules,
    shopServes = false,
}: {
    navigation: readonly SiteNavItem[];
    modules?: ModulePageStates | null;
    shopServes?: boolean;
}): SiteNavItem[] {
    return withShopLink(
        withoutShadowedInPageEntries(siteMenu(navigation, modules)),
        shopServes,
    );
}
