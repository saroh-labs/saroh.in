import Link from "next/link";
import type { ReactNode } from "react";

import type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
import { SiteMenu, SiteNavRow } from "./site-header-menu";

/**
 * The parts of a site that are not its pages: header and footer. Shared by
 * the live site (saroh.app's app/[domain]), a draft preview (app/preview,
 * #198) and the website editor's canvas (#336) — which must all look exactly
 * like the live site, so there is one implementation of each, here (#252).
 */

/** What the merchant wrote at the foot of their site. */
export interface SiteFooterContent {
    format: "html" | "markdown";
    value: string;
}

/** Where a footer line breaks into more than one line. */
const BLOCK_OR_BREAK =
    /<\/?(p|div|ul|ol|li|h[1-6]|blockquote|table|pre|hr|br)\b/i;

/**
 * A merchant's footer as one line, or `null` when it is more than that.
 *
 * The footer ends in "Runs on Saroh" (G17, default 67), set after the
 * merchant's own line with a " · ", as the design draws it. That only works
 * for a line: plain text with no line break, or html that is a single
 * paragraph. Anything richer (two paragraphs, a list, a heading) keeps its
 * own block, and "Runs on Saroh" goes on the line below it.
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

/**
 * The foot of every page (#202, G17): the merchant's own line, then
 * "Runs on Saroh" linking to saroh.in.
 *
 * "Runs on Saroh" stays on every site this round (default 67), so the footer
 * always renders now. With nothing written, the merchant's line is the site's
 * name, which the header already shows to everyone. Nothing from the business
 * profile is published here: `parseSiteFooter` in the API says why that stays
 * the merchant's to write.
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
}: {
    footer: SiteFooterContent | null | undefined;
    /** The site's name: the footer's line when the merchant wrote none. */
    name: string;
}) {
    const written = footer && footer.value.trim() !== "" ? footer : null;
    const line = written
        ? footerLine(written)
        : { kind: "text" as const, value: name.trim() };

    return (
        <footer className="border-site-border bg-site-footer-bg text-site-footer-fg font-site-body w-full border-t px-5 pb-7 pt-5 sm:px-[var(--site-page-margin)]">
            <div className="mx-auto max-w-screen-xl text-center text-[12.5px]">
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
                <p>
                    {line && line.value !== "" ? (
                        <>
                            {line.kind === "html" ? (
                                <span
                                    // Sanitized at publish — see above.
                                    dangerouslySetInnerHTML={{
                                        __html: line.value,
                                    }}
                                />
                            ) : (
                                <span>{line.value}</span>
                            )}
                            {" · "}
                        </>
                    ) : null}
                    <a
                        href="https://saroh.in"
                        target="_blank"
                        rel="noopener"
                        className="focus-visible:ring-site-footer-fg rounded-sm underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2"
                    >
                        Runs on Saroh
                    </a>
                </p>
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

/** An entry that opens the home page: "/" (or "", as a page path can be). */
function isHome(item: SiteNavItem): boolean {
    return item.href === "/" || item.href === "";
}

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
}: {
    name: string;
    navigation: SiteNavItem[];
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
    const to = (href: string) =>
        basePath && href.startsWith("/") ? `${basePath}${href}` : href;
    const items = siteMenu(navigation, modules).map((item) => ({
        label: item.label,
        href: to(item.href),
    }));
    const main = action ? { label: action.label, href: to(action.href) } : null;
    const hasMenu = items.length > 0 || main !== null;

    return (
        <header className="border-site-border bg-site-bg font-site-body sticky top-0 z-30 border-b">
            <div className="mx-auto flex min-h-11 max-w-screen-xl items-center gap-3.5 px-5 py-2.5 sm:px-[var(--site-page-margin)]">
                <Link
                    href={to("/")}
                    aria-label={`${name} — home`}
                    className="text-site-fg focus-visible:ring-site-accent flex min-w-0 cursor-pointer items-center rounded-[var(--site-radius)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 active:opacity-70"
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
