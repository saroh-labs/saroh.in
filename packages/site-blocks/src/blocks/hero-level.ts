/**
 * Which heading a hero's headline is.
 *
 * A page has one `h1`. A hero used to draw its headline as an `h1` wherever
 * it sat, so a page with two heroes had two, and a search engine and a
 * screen reader were told the page had two subjects. Only the page's FIRST
 * hero is its `h1`; any later one is an `h2`, a section of the page like
 * the rest. `PageSections` works out which is which (`heroLevels`), and
 * each hero look draws its headline through `HeroHeading`.
 *
 * Its own file, free of `"use client"`: `PageSections` calls it on the
 * server, and two of the hero's looks are client components.
 */
export type HeroLevel = 1 | 2;

/**
 * Each section's hero level, by its place on the page: `1` for the first
 * hero, `2` for every hero after it, and `1` again for anything that is not
 * a hero (it draws no headline, so the value is never read).
 *
 * `titled` is a page that already opens on its own title (a module page's
 * top, which is the page's `h1`): no hero on it is an `h1`. `skip` leaves
 * out a section that draws nothing, so a hero is never demoted by one the
 * visitor can't see.
 */
export function heroLevels(
    sections: readonly { type: string }[],
    {
        titled = false,
        skip = () => false,
    }: {
        titled?: boolean;
        skip?: (index: number) => boolean;
    } = {},
): HeroLevel[] {
    let seen = titled;
    return sections.map((section, i) => {
        if (section.type !== "hero" || skip(i)) return 1;
        if (seen) return 2;
        seen = true;
        return 1;
    });
}
