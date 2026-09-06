import Link from "next/link";

import type { PublicationSite } from "@/lib/publication";

/**
 * The parts of a site that are not its pages: header, footer, theme. Shared
 * by the live site (app/[domain]) and a draft preview (app/preview, #198),
 * which must look exactly like the live site would — that is the point of
 * showing it to a reviewer.
 */

/**
 * The merchant's own footer (#202).
 *
 * The Style panel has offered a Footer colour since #189 and this app had
 * nothing to paint with it: `--site-footer-bg` and `--site-footer-fg` were
 * resolved, published and read by nobody, so five swatches sat there looking
 * exactly like the five working rows above them and did nothing at all.
 *
 * Nothing renders when the merchant has written nothing. An empty band in
 * their footer colour would be this app inventing a footer they never asked
 * for — and the colour row would still be lying, just more colourfully.
 *
 * SAFETY. `value` is rendered with `dangerouslySetInnerHTML` when the format is
 * html, and that is safe for exactly one reason: publish sanitized it through
 * the same allowlist as `richText.value` before writing the immutable snapshot,
 * so what arrives here is already-cleaned markup. This app never receives raw
 * author input. Markdown renders as escaped pre-wrapped text, because there is
 * no markdown library in this app's dependencies and guessing at one would mean
 * emitting HTML nobody cleaned.
 */
export function SiteFooter({ footer }: { footer: PublicationSite["footer"] }) {
    if (!footer || footer.value.trim() === "") return null;

    return (
        <footer className="w-full bg-site-footer-bg px-5 py-[var(--site-section-padding)] text-site-footer-fg sm:px-[var(--site-page-margin)]">
            <div className="mx-auto max-w-screen-xl text-sm">
                {footer.format === "html" ? (
                    <div
                        /* The merchant's footer text colour governs, not the
                           prose defaults — the same reason richText overrides
                           them: a chosen palette must not be repainted by a
                           typography plugin's greys. */
                        className="prose prose-sm max-w-none prose-headings:text-site-footer-fg prose-p:text-site-footer-fg prose-a:text-site-footer-fg prose-strong:text-site-footer-fg prose-li:text-site-footer-fg"
                        // Sanitized at publish — see the safety note above.
                        dangerouslySetInnerHTML={{ __html: footer.value }}
                    />
                ) : (
                    <p className="whitespace-pre-wrap">{footer.value}</p>
                )}
            </div>
        </footer>
    );
}

/**
 * The site's name and its menu (#206).
 *
 * With no menu the header is what it always was: the name, centred, linking
 * home. With one, the name goes left and the menu sits beside it from `sm` up.
 *
 * ON A PHONE THE MENU IS A <details>. No JavaScript, no hover (§19), and it
 * works before hydration and with scripts blocked. A horizontal row of six
 * entries at 375px is not a menu, it is a scroll bar; a disclosure that opens
 * a list is the same information a thumb can use.
 */
export function SiteHeader({
    name,
    navigation,
    basePath = "",
}: {
    name: string;
    navigation: { label: string; href: string }[];
    /**
     * Prefix for every link, "" on a live site. A draft preview (#198) lives
     * under /preview/<token>, and a menu that pointed at "/about" would drop
     * the reviewer out of the preview onto the live site — or a 404.
     */
    basePath?: string;
}) {
    const hasMenu = navigation.length > 0;
    const to = (href: string) =>
        basePath && href.startsWith("/") ? `${basePath}${href}` : href;
    const linkClass =
        "rounded-[var(--site-radius)] px-2 py-1 text-sm text-site-body transition-colors hover:text-site-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent";
    return (
        <header className="left-0 right-0 top-0 z-30 border-b border-site-border bg-site-surface">
            <div
                className={
                    hasMenu
                        ? "mx-auto flex h-16 max-w-screen-xl items-center justify-between gap-6 px-5 sm:px-[var(--site-page-margin)]"
                        : "mx-auto flex h-16 max-w-screen-xl items-center justify-center px-10 sm:px-20"
                }
            >
                <Link href={to("/")} className="flex items-center">
                    <span className="inline-block truncate text-lg font-medium tracking-tight text-site-fg">
                        {name}
                    </span>
                </Link>
                {hasMenu ? (
                    <>
                        <nav
                            aria-label="Site"
                            className="hidden sm:flex sm:items-center sm:gap-1"
                        >
                            {navigation.map((item) => (
                                <Link
                                    key={item.href}
                                    href={to(item.href)}
                                    className={linkClass}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                        <details className="relative sm:hidden">
                            <summary className="cursor-pointer list-none rounded-[var(--site-radius)] border border-site-border px-3 py-1.5 text-sm text-site-fg [&::-webkit-details-marker]:hidden">
                                Menu
                            </summary>
                            <nav
                                aria-label="Site"
                                className="absolute right-0 top-full z-40 mt-2 flex min-w-44 flex-col gap-1 rounded-[var(--site-radius)] border border-site-border bg-site-surface p-2"
                            >
                                {navigation.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={to(item.href)}
                                        className={linkClass + " block"}
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                            </nav>
                        </details>
                    </>
                ) : null}
            </div>
        </header>
    );
}
