import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import type { ReactNode } from "react";

import { siteImage } from "./lib/site-image";
import type { SiteSession } from "./look-chrome";
import { lookOf } from "./look-context";
import { LookHeader } from "./look-header";
import type { SiteContact } from "./site-footer-contact";
import type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
import { SiteActionLink, SiteMenu, SiteNavRow } from "./site-header-menu";
import type { ModulePageStates } from "./site-menu";
import { siteMenuEntries, underBasePath } from "./site-menu";
import { withoutPrimaryAction } from "./site-primary-action";

/**
 * The parts of a site that are not its pages: header and footer. Shared by
 * the live site (saroh.app's app/[domain]), a draft preview (app/preview,
 * #198) and the website editor's canvas (#336) — which must all look exactly
 * like the live site, so there is one implementation of each: the header
 * here, the footer in `site-footer.tsx`, the menu both draw in
 * `site-menu.ts` (#252).
 */
export type { SiteSession } from "./look-chrome";
export {
    FOOTER_LAYOUTS,
    footerLine,
    madeWithSarohHref,
    SiteFooter,
} from "./site-footer";
export type {
    FooterLayout,
    SiteCredit,
    SiteFooterContent,
} from "./site-footer";
export type { SiteContact, SiteContactPlace } from "./site-footer-contact";
export { siteMenu, siteMenuEntries, withShopLink } from "./site-menu";
export type { ModulePageStates } from "./site-menu";

/**
 * The header over a full-bleed hero (U2).
 *
 * When the page's first section is a full-bleed hero, `PageSections` marks
 * its wrapper `data-site-first-hero`, and these classes — keyed off that
 * mark with `:has()`, so the layout needs to know nothing about the page —
 * lay the header over the photo: no longer sticky, taking no room of its
 * own (the hero leaves room for it), with no ground or rule of its own, but
 * its own band of the page's ink fading down from the top, so the name and
 * the menu read over any photo, or over none. The words over it take the
 * page's paper, as the hero's do. Every other page's header is unchanged:
 * without the mark, none of these classes applies.
 *
 * Literal strings, not built from a prefix, so Tailwind finds them.
 */
// Joined, not `cn()`-merged: tailwind-merge reads the gradient as
// replacing `bg-transparent` and drops it, and the ground would show.
const OVER_PHOTO = [
    "[body:has([data-site-first-hero])_&]:relative",
    "[body:has([data-site-first-hero])_&]:-mb-16",
    "[body:has([data-site-first-hero])_&]:h-16",
    "[body:has([data-site-first-hero])_&]:border-transparent",
    "[body:has([data-site-first-hero])_&]:bg-transparent",
    "[body:has([data-site-first-hero])_&]:bg-gradient-to-b",
    "[body:has([data-site-first-hero])_&]:from-site-fg/75",
    "[body:has([data-site-first-hero])_&]:to-transparent",
].join(" ");

/**
 * The business's mark beside its name (DEC-124): the site's own icon, else
 * the business logo, as the public site read resolves it. A site with
 * neither shows its name alone; the plain initial tile is for the browser
 * tab, where there is no name beside it.
 */
export interface SiteHeaderLogo {
    url: string;
}

/**
 * The site's header (#206, G17), in one row: the business's mark and name,
 * the menu, the bag, Sign in or the avatar, and ONE main button.
 *
 * ONE PRIMARY ACTION. The main button is the site's primary action ("Book",
 * "Order" or "Contact us", `sitePrimaryAction`), and the menu beside it
 * leaves out the page that button opens (`withoutPrimaryAction`): the
 * header never asks for the same thing twice. The footer's menu still
 * lists every page.
 *
 * THE ROW NEVER LOSES ITS ACTIONS. A long name is cut with an ellipsis (its
 * full text stays in the link's name and its tooltip) and a long menu
 * scrolls inside its own part of the row, so the bag, the account and the
 * main button keep their place at every width.
 *
 * Below 820px the menu and the main button fold into a menu button; its
 * panel opens under the header with the main button full-width at its foot
 * (`SiteMenu`). With no menu and no main button there is no menu button.
 *
 * SLOTS. `bag` and `account` are drawn only when given, and an empty slot
 * draws nothing rather than a button that goes nowhere. The main button
 * follows the same rule: `action` is `null` unless its page serves for
 * this site.
 *
 * Drawn in the site's own tokens and type; the name is set in
 * `font-site-heading`.
 */
export function SiteHeader({
    name,
    navigation,
    basePath = "",
    action = null,
    logo = null,
    bag,
    account,
    modules,
    shopServes = false,
    look,
    contact = null,
    session = null,
}: {
    /**
     * The site's look (DEC-172, U5): Folio, Quiet or Live draw their own
     * header, phone menu and main button (`look-header.tsx`). Absent, or
     * anything this build doesn't know, is Classic: this header, unchanged.
     */
    look?: LookId | null;
    /**
     * The business's public place and ways to reach it, as the footer
     * takes them: a look's phone menu says where to visit and today's
     * hours, and offers Call and the business's WhatsApp chat. Classic
     * doesn't read it.
     */
    contact?: SiteContact | null;
    /**
     * Whether a customer is signed in, for the look's phone menu (Your
     * account or Sign in); null when the site has no accounts.
     */
    session?: SiteSession | null;
    name: string;
    navigation: SiteNavItem[];
    /**
     * `/shop` serves for this site now (P4): the menu gets a Shop entry
     * unless it already opens the shop (`withShopLink`). Only the live
     * site passes it; the editor's canvas and a draft preview don't.
     */
    shopServes?: boolean;
    /**
     * Whether each module page shows now (G15), from the public site read.
     * An entry whose module is off leaves the menu; one not named here
     * stays (see `siteMenu`).
     */
    modules?: ModulePageStates | null;
    /**
     * Prefix for every link, "" on a live site. A draft preview (#198) lives
     * under /preview/<token>, and a menu that pointed at "/about" would drop
     * the reviewer out of the preview onto the live site — or a 404.
     */
    basePath?: string;
    /** The site's primary action (`sitePrimaryAction`), or none. */
    action?: SiteHeaderAction | null;
    /** The business's mark (DEC-124), drawn beside the name; none draws none. */
    logo?: SiteHeaderLogo | null;
    /** The bag and its count (G13). Nothing is drawn until it is given. */
    bag?: ReactNode;
    /** Sign in, or the signed-in customer's avatar (A3). Same rule. */
    account?: ReactNode;
}) {
    const to = (href: string) => underBasePath(basePath, href);
    // The menu less the page the main button opens: one ask, said once.
    const items = withoutPrimaryAction(
        siteMenuEntries({ navigation, modules, shopServes }),
        action,
    ).map((item) => ({
        label: item.label,
        href: to(item.href),
    }));
    const main = action ? { label: action.label, href: to(action.href) } : null;
    const hasMenu = items.length > 0 || main !== null;
    const mark = logo?.url.trim() ? logo.url.trim() : null;

    const drawn = lookOf(look);
    if (drawn) {
        return (
            <LookHeader
                look={drawn}
                name={name}
                items={items}
                homeHref={to("/")}
                action={main ? { ...main, kind: action?.kind } : null}
                logo={mark}
                bag={bag}
                account={account}
                contact={contact}
                session={session}
                basePath={basePath}
            />
        );
    }

    return (
        <header
            data-site-header=""
            className={`border-site-border bg-site-bg font-site-body sticky top-0 z-30 border-b ${OVER_PHOTO}`}
        >
            <div className="max-w-site-content mx-auto flex min-h-11 items-center gap-3 px-5 py-2.5 sm:px-[var(--site-page-margin)]">
                <Link
                    href={to("/")}
                    aria-label={`${name}, home`}
                    title={name}
                    // `min-w-0` lets the name give way (its words truncate)
                    // rather than push the row's actions off the edge. The
                    // menu beside it gives way four times as fast and then
                    // scrolls, so a long name is cut only as a last resort.
                    className="text-site-fg focus-visible:ring-site-accent [body:has([data-site-first-hero])_&]:text-site-bg [body:has([data-site-first-hero])_&]:focus-visible:ring-site-bg focus-visible:ring-offset-site-bg [body:has([data-site-first-hero])_&]:focus-visible:ring-offset-site-fg flex min-w-0 flex-[0_1_auto] cursor-pointer items-center gap-2.5 rounded-[var(--site-radius)] transition-opacity duration-150 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-70"
                >
                    {mark ? (
                        // The name beside it says whose it is, so the mark
                        // itself is not read out. Remote media from any
                        // tenant origin: a plain <img>, as every block's.
                        <img
                            src={mark}
                            alt=""
                            width={32}
                            height={32}
                            // On the first screen of every page.
                            {...siteImage("above", {
                                src: mark,
                                sizes: "120px",
                            })}
                            data-site-logo=""
                            className="h-8 w-auto max-w-[7.5rem] shrink-0 rounded-[min(var(--site-radius),8px)] object-contain"
                        />
                    ) : null}
                    <span className="font-site-heading truncate text-lg font-semibold tracking-[-0.02em]">
                        {name}
                    </span>
                </Link>
                {items.length > 0 ? <SiteNavRow items={items} /> : null}
                <span className="min-w-0 flex-1" />
                {bag ?? null}
                {account ?? null}
                {main ? <SiteActionLink action={main} /> : null}
                {hasMenu ? <SiteMenu items={items} action={main} /> : null}
            </div>
        </header>
    );
}
