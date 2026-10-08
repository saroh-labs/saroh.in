import Link from "next/link";
import type { ReactNode } from "react";

import { withoutShadowedInPageEntries } from "@saroh/block-contract";

import { CookieChoicesButton } from "./consent-banner";
import type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
import { SiteMenu, SiteNavRow } from "./site-header-menu";
import { trimTrailingSlashes } from "./url-path";

/**
 * The parts of a site that are not its pages: header and footer. Shared by
 * the live site (saroh.app's app/[domain]), a draft preview (app/preview,
 * #198) and the website editor's canvas (#336) — which must all look exactly
 * like the live site, so there is one implementation of each, here (#252).
 */

/**
 * How the footer is laid out. Absent is today's: one centred line. `left`
 * is the industry designs' row: the site's name in its heading face, the
 * merchant's line beside it, and the Saroh credit (Free only) at the far end.
 */
export const FOOTER_LAYOUTS = ["centre", "left"] as const;
export type FooterLayout = (typeof FOOTER_LAYOUTS)[number];

/** What the merchant wrote at the foot of their site. */
export interface SiteFooterContent {
    format: "html" | "markdown";
    value: string;
    layout?: FooterLayout;
}

/** Where a footer line breaks into more than one line. */
const BLOCK_OR_BREAK =
    /<\/?(p|div|ul|ol|li|h[1-6]|blockquote|table|pre|hr|br)\b/i;

/**
 * A merchant's footer as one line, or `null` when it is more than that.
 *
 * On Free the footer ends in "Made with Saroh" (DEC-102), set after the
 * merchant's own line with a " · ", as the design draws it. That only works
 * for a line: plain text with no line break, or html that is a single
 * paragraph. Anything richer (two paragraphs, a list, a heading) keeps its
 * own block, and the credit goes on the line below it.
 *
 * The html branch hands back the paragraph's inner markup. Publish sanitized
 * the whole value, and a `<p>`'s contents are inline markup, so drawing them
 * inside a `<span>` is the same markup, one wrapper lighter.
 */
export function footerLine(
    footer: SiteFooterContent,
): { kind: "text" | "html"; value: string } | null {
    const value = footer.value.trim();
    if (footer.format !== "html") {
        return value.includes("\n") ? null : { kind: "text", value };
    }
    const inner = /^<p>([\s\S]*)<\/p>$/i.exec(value)?.[1];
    if (inner === undefined || BLOCK_OR_BREAK.test(inner)) return null;
    return { kind: "html", value: inner };
}

/** A trimmed string, or null when there is nothing in it. */
function nonBlank(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

/**
 * The business's public phone and place (UX-038), and its contact email
 * when it has added one (DEC-101), for the footer.
 */
export interface SiteContact {
    phone: string | null;
    address: string | null;
    email?: string | null;
}

/**
 * The Saroh credit a Free site's footer carries (DEC-102): "Made with
 * Saroh", linking to saroh.in with the business's referral code (#812).
 * Paid plans have none, and a site drawn with none shows no Saroh credit.
 */
export interface SiteCredit {
    href: string;
}

/** Where "Made with Saroh" links: saroh.in with the business's code. */
export function madeWithSarohHref(referralCode: string): string {
    return `https://saroh.in/?ref=${encodeURIComponent(referralCode)}`;
}

/**
 * The foot of every page (#202, G17): the merchant's own line, then on Free
 * "Made with Saroh" linking to saroh.in with the business's referral code
 * (DEC-102). Paid plans show no Saroh credit; the renderer reads the plan
 * and passes `credit` only for Free.
 *
 * The footer always renders. With nothing written, the merchant's line is
 * the site's name, which the header already shows to everyone.
 *
 * `contact` (UX-038) is the business's PUBLIC place and phone: the same live
 * read the Visit us block and the booking header show (`/visit`, G8, DEC-053),
 * where Settings › Business calls the number "Phone on your website". Its
 * `email` is the business's contact email, shown when the business has added
 * one (DEC-101); Settings › Business says the site shows it.
 *
 * The link is plain text in the site's own footer colours and type, never
 * Saroh's colours or font: a merchant's site does not wear the brand. The
 * merchant's Footer colour (#189) still paints the band.
 *
 * SAFETY. `value` is rendered with `dangerouslySetInnerHTML` when the format is
 * html, and that is safe for exactly one reason: publish sanitized it through
 * the same allowlist as `richText.value` before writing the immutable snapshot,
 * so what arrives here is already-cleaned markup. The editor's canvas passes a
 * draft footer the API sanitized the same way (`footerPreview`), so no caller
 * hands this raw author input. Markdown renders as escaped pre-wrapped text,
 * because there is no markdown library in this app's dependencies and
 * guessing at one would mean emitting HTML nobody cleaned.
 */
export function SiteFooter({
    footer,
    name,
    contact = null,
    credit = null,
    cookieChoices = false,
}: {
    footer: SiteFooterContent | null | undefined;
    /** The site's name: the footer's line when the merchant wrote none. */
    name: string;
    /** The business's public phone, place and email; null draws none. */
    contact?: SiteContact | null;
    /** "Made with Saroh" on Free (DEC-102); null shows no Saroh credit. */
    credit?: SiteCredit | null;
    /**
     * "Cookie choices", while a tracker the merchant connected asks the
     * visitor (DEC-108). Off draws nothing.
     */
    cookieChoices?: boolean;
}) {
    const phone = nonBlank(contact?.phone);
    const email = nonBlank(contact?.email);
    const address = nonBlank(contact?.address);
    const written = footer && footer.value.trim() !== "" ? footer : null;
    if (footer?.layout === "left") {
        return (
            <LeftFooter
                written={written}
                name={name}
                credit={credit}
                cookieChoices={cookieChoices}
            />
        );
    }
    const line = written
        ? footerLine(written)
        : { kind: "text" as const, value: name.trim() };
    const hasLine = line !== null && line.value !== "";

    return (
        <footer className="border-site-border bg-site-footer-bg text-site-footer-fg font-site-body w-full border-t px-5 pb-7 pt-5 sm:px-[var(--site-page-margin)]">
            <div className="max-w-site-content mx-auto text-center text-[12.5px]">
                {written && line === null ? (
                    written.format === "html" ? (
                        <div
                            /* The merchant's footer text colour governs, not the
                               prose defaults — the same reason richText overrides
                               them: a chosen palette must not be repainted by a
                               typography plugin's greys. */
                            className="prose prose-sm prose-headings:text-site-footer-fg prose-p:text-site-footer-fg prose-a:text-site-footer-fg prose-strong:text-site-footer-fg prose-li:text-site-footer-fg mx-auto mb-3 max-w-none"
                            // Sanitized at publish — see the safety note above.
                            dangerouslySetInnerHTML={{ __html: written.value }}
                        />
                    ) : (
                        <p className="mb-3 whitespace-pre-wrap text-sm">
                            {written.value}
                        </p>
                    )
                ) : null}
                {phone || email || address ? (
                    <p className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px]">
                        {phone ? (
                            <a
                                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                                className={FOOTER_LINK}
                            >
                                Call {phone}
                            </a>
                        ) : null}
                        {email ? (
                            <a href={`mailto:${email}`} className={FOOTER_LINK}>
                                {email}
                            </a>
                        ) : null}
                        {address ? <span>{address}</span> : null}
                    </p>
                ) : null}
                {hasLine || credit || cookieChoices ? (
                    <p>
                        {line && hasLine ? (
                            line.kind === "html" ? (
                                <span
                                    // Sanitized at publish — see above.
                                    dangerouslySetInnerHTML={{
                                        __html: line.value,
                                    }}
                                />
                            ) : (
                                <span>{line.value}</span>
                            )
                        ) : null}
                        {hasLine && credit ? " · " : null}
                        {credit ? <MadeWithSaroh credit={credit} /> : null}
                        {(hasLine || credit) && cookieChoices ? " · " : null}
                        {cookieChoices ? <CookieChoicesButton /> : null}
                    </p>
                ) : null}
            </div>
        </footer>
    );
}

/** A link in the footer, in the footer's own colours. */
const FOOTER_LINK =
    "focus-visible:ring-site-footer-fg rounded-sm underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2";

/**
 * "Made with Saroh" (DEC-102), in the footer's own colours and type, never
 * Saroh's: a merchant's site does not wear the brand.
 */
function MadeWithSaroh({
    credit,
    className = "",
}: {
    credit: SiteCredit;
    className?: string;
}) {
    return (
        <a
            href={credit.href}
            target="_blank"
            rel="noopener"
            className={[FOOTER_LINK, className].filter(Boolean).join(" ")}
        >
            Made with Saroh
        </a>
    );
}

/**
 * The `left` footer — the designs' row (Bakery, Ceramics, Blogs): one row
 * on the page's column, its margins inside the column so it lines up with
 * the header and the sections, wrapping on a phone —
 * the name in the heading face, the merchant's line (an address, the days
 * they open), and on Free "Made with Saroh" pushed to the far end. A footer richer
 * than a line keeps its own block above the row, left-aligned too. The same
 * safety note as {@link SiteFooter}: html arrives sanitized.
 */
function LeftFooter({
    written,
    name,
    credit,
    cookieChoices,
}: {
    written: SiteFooterContent | null;
    name: string;
    credit: SiteCredit | null;
    cookieChoices: boolean;
}) {
    const line = written ? footerLine(written) : null;
    return (
        <footer className="border-site-border bg-site-footer-bg text-site-footer-fg font-site-body w-full border-t pb-12 pt-6">
            {/* The margins inside the column, as the header and every
                section have them, so the name lines up with the page's
                left edge on a template's column (`--site-content-width`). */}
            <div className="max-w-site-content mx-auto px-5 sm:px-[var(--site-page-margin)]">
                {written && line === null ? (
                    written.format === "html" ? (
                        <div
                            className="prose prose-sm prose-headings:text-site-footer-fg prose-p:text-site-footer-fg prose-a:text-site-footer-fg prose-strong:text-site-footer-fg prose-li:text-site-footer-fg mb-4 max-w-none"
                            // Sanitized at publish — see SiteFooter.
                            dangerouslySetInnerHTML={{ __html: written.value }}
                        />
                    ) : (
                        <p className="mb-4 whitespace-pre-wrap text-sm">
                            {written.value}
                        </p>
                    )
                ) : null}
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[13.5px]">
                    <span className="font-site-heading text-base font-semibold tracking-[-0.02em]">
                        {name.trim()}
                    </span>
                    {line && line.value !== "" ? (
                        line.kind === "html" ? (
                            <span
                                // Sanitized at publish — see SiteFooter.
                                dangerouslySetInnerHTML={{ __html: line.value }}
                            />
                        ) : (
                            <span>{line.value}</span>
                        )
                    ) : null}
                    {cookieChoices ? (
                        <CookieChoicesButton className="ml-auto" />
                    ) : null}
                    {credit ? (
                        <MadeWithSaroh
                            credit={credit}
                            className={cookieChoices ? "" : "ml-auto"}
                        />
                    ) : null}
                </div>
            </div>
        </footer>
    );
}

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
 * The site's header (#206, G17), in one row: the name, the menu, the bag,
 * Sign in or the avatar, and the main button ("Book" or "Order").
 *
 * Below 820px the menu and the main button fold into a menu button; its list
 * opens under the header with the main button full-width at its foot
 * (`SiteMenu`). With no menu and no main button there is no menu button.
 *
 * SLOTS. `bag` and `account` are drawn only when given. The bag (G13) and
 * sign-in (plan A, A3) are not built yet, and an empty slot draws nothing
 * rather than a button that goes nowhere. The main button follows the same
 * rule: `action` is `null` unless its page serves for this site.
 *
 * Drawn in the site's own tokens and type; the name is set in
 * `font-site-heading`. The logo and the letter tile belong to the Brand track
 * (plan H) and come with it.
 */
export function SiteHeader({
    name,
    navigation,
    basePath = "",
    action = null,
    bag,
    account,
    modules,
    shopServes = false,
}: {
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
    /** "Book" to /book, "Order" to /shop, or none. */
    action?: SiteHeaderAction | null;
    /** The bag and its count (G13). Nothing is drawn until it is given. */
    bag?: ReactNode;
    /** Sign in, or the signed-in customer's avatar (A3). Same rule. */
    account?: ReactNode;
}) {
    const to = (href: string) => {
        if (!basePath || !href.startsWith("/")) return href;
        // A section of the home page (`/#visit`): the preview's own home,
        // with the anchor, never "/preview/<token>/#visit".
        if (href.startsWith("/#")) return `${basePath}${href.slice(1)}`;
        return `${basePath}${href}`;
    };
    // A section entry a page entry names leaves once the modules that are
    // off have (`withoutShadowedInPageEntries`): it stands in for its module
    // page only while that page is out of the menu.
    const items = withShopLink(
        withoutShadowedInPageEntries(siteMenu(navigation, modules)),
        shopServes,
    ).map((item) => ({
        label: item.label,
        href: to(item.href),
    }));
    const main = action ? { label: action.label, href: to(action.href) } : null;
    const hasMenu = items.length > 0 || main !== null;

    return (
        <header
            data-site-header=""
            className={`border-site-border bg-site-bg font-site-body sticky top-0 z-30 border-b ${OVER_PHOTO}`}
        >
            <div className="max-w-site-content mx-auto flex min-h-11 items-center gap-3.5 px-5 py-2.5 sm:px-[var(--site-page-margin)]">
                <Link
                    href={to("/")}
                    aria-label={`${name} — home`}
                    className="text-site-fg focus-visible:ring-site-accent [body:has([data-site-first-hero])_&]:text-site-bg flex min-w-0 cursor-pointer items-center rounded-[var(--site-radius)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 active:opacity-70"
                >
                    <span className="font-site-heading truncate text-lg font-semibold tracking-[-0.02em]">
                        {name}
                    </span>
                </Link>
                {items.length > 0 ? <SiteNavRow items={items} /> : null}
                <span className="flex-1" />
                {bag ?? null}
                {account ?? null}
                {main ? (
                    <Link
                        href={main.href}
                        className="bg-site-accent text-site-accent-fg focus-visible:ring-site-accent focus-visible:ring-offset-site-bg coarse:min-h-11 hidden h-10 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[var(--site-radius)] px-4 text-sm font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-80 min-[820px]:inline-flex"
                    >
                        {main.label}
                    </Link>
                ) : null}
                {hasMenu ? <SiteMenu items={items} action={main} /> : null}
            </div>
        </header>
    );
}
