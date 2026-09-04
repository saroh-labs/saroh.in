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
 * Per-publication theme (#189).
 *
 * The merchant's six colour choices and five spacing scalars, already resolved
 * into `--site-*` custom properties by the publisher and carried in the
 * snapshot. Until now this component hardcoded the stone defaults with a note
 * saying it would interpolate brand fields "once the snapshot carries them" —
 * the snapshot has carried them since #189, and the live site went on showing
 * greys no merchant chose while the editor preview showed their actual palette.
 *
 * The defaults below are still the fallback, and they matter: publications are
 * immutable, so every site published before #189 has no `styleVariables` at all
 * and must keep rendering exactly as it always has.
 *
 * Deliberately NOT Saroh's brand tokens: this subtree is the merchant's
 * website, not a Saroh surface.
 */
export function SiteTheme({
    variables,
}: {
    variables?: Record<string, string> | null;
}) {
    const custom = cssVariables(variables);

    return (
        <style>{`
            :root {
                --site-bg: 0 0% 100%;
                --site-surface: 0 0% 100%;
                --site-fg: 24 10% 10%;
                --site-accent: 24 10% 10%;
                --site-accent-fg: 0 0% 100%;
                --site-hero-bg: 0 0% 100%;
                --site-hero-fg: 24 10% 10%;
                --site-cta-bg: 24 10% 10%;
                --site-cta-fg: 0 0% 98%;
                --site-footer-bg: 24 10% 10%;
                --site-footer-fg: 0 0% 98%;
                --site-page-margin: 38px;
                --site-section-padding: 52px;
                --site-grid-gap: 14px;
                --site-radius: 2px;
                --site-heading-scale: 1;
            }
${
    custom === null
        ? /*
           * The OS dark preference applies ONLY to an unstyled site.
           *
           * A merchant who chose a paper ground chose it for everyone; flipping
           * their storefront to black because a visitor's laptop is in dark
           * mode overrides a decision they made deliberately, and it is not a
           * decision this app is entitled to make on their behalf. Sites with
           * no palette keep the old behaviour, which is what they have always
           * had.
           */
          `            @media (prefers-color-scheme: dark) {
                :root {
                    --site-bg: 0 0% 0%;
                    --site-surface: 24 6% 10%;
                    --site-fg: 0 0% 100%;
                    --site-accent: 0 0% 100%;
                    --site-accent-fg: 24 10% 10%;
                    --site-hero-bg: 24 6% 10%;
                    --site-hero-fg: 0 0% 100%;
                    --site-cta-bg: 0 0% 100%;
                    --site-cta-fg: 24 10% 10%;
                    --site-footer-bg: 24 6% 10%;
                    --site-footer-fg: 0 0% 100%;
                }
            }`
        : `            :root {\n${custom}\n            }`
}
        `}</style>
    );
}

/**
 * Render a snapshot's style variables as CSS declarations, or null when there
 * are none worth writing.
 *
 * Both the name and the value are checked against a tight allowlist before
 * being interpolated. The values come from our own publisher and are resolved
 * from a curated palette, so nothing hostile is expected here — but this is
 * string interpolation into a `<style>` element, and a rule that only holds as
 * long as every upstream writer stays well-behaved is not a rule. A property
 * that fails the check is dropped, so a bad value costs its own colour rather
 * than the whole stylesheet.
 */
function cssVariables(
    variables: Record<string, string> | null | undefined,
): string | null {
    if (!variables) return null;
    const safeName = /^--site-[a-z-]+$/;
    // HSL triples ("18 45% 45%"), lengths ("38px") and bare scales ("1.05").
    const safeValue = /^[a-zA-Z0-9 .%]{1,64}$/;

    const declarations = Object.entries(variables)
        .filter(
            ([name, value]) =>
                safeName.test(name) &&
                typeof value === "string" &&
                safeValue.test(value),
        )
        .map(([name, value]) => `                ${name}: ${value};`);

    return declarations.length > 0 ? declarations.join("\n") : null;
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
