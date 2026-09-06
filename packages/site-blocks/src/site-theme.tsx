/**
 * The merchant's token layer (#189, moved here by #252).
 *
 * These variables ARE the separation between Saroh's brand and a merchant's
 * site. `apps/saroh.app/tailwind.config.ts` was the only place the `site.*`
 * colour namespace existed, which is why the editor's preview could not write
 * the same classes the live renderer writes and reached for
 * `bg-[hsl(var(--site-bg))]` instead. Two files drawing the same thing in two
 * notations, because only one of them had the vocabulary. Moving the blocks
 * without moving this would have let them drift apart again the same way.
 */

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
    selector = ":root",
}: {
    variables?: Record<string, string> | null;
    /**
     * What the variables are declared on. `:root` — the default, and what the
     * live renderer and the editor preview both want — themes the whole
     * document, which is right when a document IS one merchant's site.
     *
     * The ui.saroh.in catalog is the case that needed anything else: showing
     * one block in three palettes side by side means three theme scopes on one
     * page, and `:root` can only be written once. Pass a selector (and put it
     * on a wrapper) to scope a palette to a subtree — {@link SiteThemeScope}
     * does both.
     *
     * Not a free-form string on the way to a `<style>` element by accident: it
     * is checked below, for the same reason the variable names and values are.
     */
    selector?: string;
}) {
    const custom = cssVariables(variables);
    const at = safeSelector(selector);

    return (
        <style>{`
            ${at} {
                --site-bg: 0 0% 100%;
                --site-surface: 0 0% 100%;
                --site-fg: 24 10% 10%;
                /* Body text: quieter than a heading, still readable. The
                   Tailwind config has mapped site-body since S2-006 and
                   nothing ever defined the variable, so every user of it —
                   the layout root, the 404 page, checkout — fell back to
                   near-black, which is invisible on a dark ground. */
                --site-body: 24 6% 34%;
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
                ${at} {
                    --site-bg: 0 0% 0%;
                    --site-surface: 24 6% 10%;
                    --site-fg: 0 0% 100%;
                    --site-body: 0 0% 78%;
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
        : `            ${at} {\n${custom}\n            }`
}
        `}</style>
    );
}

/**
 * A selector safe to interpolate into a `<style>` element.
 *
 * Same reasoning as `cssVariables` below: everything written into that element
 * is checked, not trusted, because a rule that holds only while every caller
 * stays well-behaved is not a rule. Allows `:root`, a class, an id, and an
 * attribute selector — which is every shape a theme scope needs and nothing
 * that can close the block and start writing rules of its own.
 *
 * An unrecognised selector falls back to `:root` rather than throwing: a
 * mis-scoped theme is a visual bug on one page, and an exception here would
 * take down the whole document.
 */
function safeSelector(selector: string): string {
    return /^(:root|[.#][A-Za-z_][\w-]*|\[[a-z-]+(="[\w-]+")?\])$/.test(
        selector,
    )
        ? selector
        : ":root";
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
 * One merchant palette, scoped to what it wraps.
 *
 * For the catalog, where several palettes share a page and `:root` can only be
 * written once. The live renderer and the editor preview do NOT use this —
 * they each render one site per document, where `:root` is both correct and
 * what they have always emitted.
 */
export function SiteThemeScope({
    variables,
    name,
    children,
}: {
    variables?: Record<string, string> | null;
    /** Distinguishes this scope from the others on the page. */
    name: string;
    children: React.ReactNode;
}) {
    const scope = `site-theme-${name.replace(/[^\w-]/g, "")}`;
    return (
        <div className={scope}>
            <SiteTheme variables={variables} selector={`.${scope}`} />
            {children}
        </div>
    );
}
