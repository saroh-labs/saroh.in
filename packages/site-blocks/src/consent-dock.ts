/**
 * Where a look's cookie banner sits, so it never covers the hero's buttons
 * (DEC-108, DEC-172, plan U15, #1108). Pure, so the rule is tested without
 * a browser; `consent-banner.tsx` measures and asks.
 *
 * The banner floats at the foot of the screen, inset by {@link DOCK_INSET},
 * as each look's board draws it (VA25, VD25, VB25). While it is there it
 * counts as the page's one fixed bar: the Book bar and Live's dock wait
 * (`sticky-actions.tsx`), and the page is lifted by its height
 * (`--site-consent-offset`, set by the banner) so the footer's last line
 * can still be scrolled clear of it.
 *
 * If, where it is, it would cover one of the hero's buttons (on a short
 * phone, or a page whose main button sits low), it moves to the top of the
 * screen instead, and back once the foot is clear again: the two spots are
 * a whole banner apart, so one button can't be under both at once.
 */

/** A box on the screen, in CSS pixels from the viewport's top left. */
export interface ScreenBox {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

/** The banner's gap from the screen's edges, as the boards draw it. */
export const DOCK_INSET = 12;

export type ConsentDock = "bottom" | "top";

/** Whether two boxes share any area (touching edges don't count). */
export function boxesOverlap(a: ScreenBox, b: ScreenBox): boolean {
    return (
        a.left < b.right &&
        b.left < a.right &&
        a.top < b.bottom &&
        b.top < a.bottom
    );
}

/**
 * The spot a banner `height` tall, between `left` and `right`, takes at
 * the foot or the top of a screen `viewport` tall.
 */
export function dockBox(
    dock: ConsentDock,
    {
        viewport,
        height,
        left,
        right,
    }: { viewport: number; height: number; left: number; right: number },
): ScreenBox {
    return dock === "bottom"
        ? {
              top: viewport - DOCK_INSET - height,
              bottom: viewport - DOCK_INSET,
              left,
              right,
          }
        : { top: DOCK_INSET, bottom: DOCK_INSET + height, left, right };
}

/**
 * The foot, unless the banner there would cover one of `targets` (the
 * hero's buttons on screen now); then the top, unless that covers one
 * too, in which case the foot (nothing better can be done, and the
 * visitor can answer and move on).
 */
export function consentDock({
    viewport,
    height,
    left,
    right,
    targets,
}: {
    viewport: number;
    height: number;
    left: number;
    right: number;
    targets: readonly ScreenBox[];
}): ConsentDock {
    const size = { viewport, height, left, right };
    const onScreen = targets.filter(
        (t) => t.bottom > 0 && t.top < viewport && t.right > t.left,
    );
    const covers = (dock: ConsentDock) =>
        onScreen.some((t) => boxesOverlap(dockBox(dock, size), t));
    if (!covers("bottom")) return "bottom";
    return covers("top") ? "bottom" : "top";
}

/**
 * The buttons the banner must keep clear of: every link and button in a
 * look's hero, and the page's first main action (`data-site-primary`)
 * where the page has no hero. The chrome's own controls are not counted,
 * nor a booking step's bar: that is fixed at the foot and lifted above the
 * banner by `--site-consent-offset`, so the banner can never cover it.
 */
export function heroTargets(doc: Document): Element[] {
    const hero = Array.from(
        doc.querySelectorAll(
            "[data-site-look-hero] a[href], [data-site-look-hero] button",
        ),
    );
    if (hero.length > 0) return hero;
    // The page's root says `data-site-primary="shown"` too (the chrome's
    // controller): only an element in the page is an action.
    const marked = doc.querySelectorAll("body [data-site-primary]");
    const first = Array.from(marked).find(
        (el) =>
            el.closest(
                "[data-site-header], [data-site-footer], [data-site-chrome-bar], [data-booking-bar], [role='dialog'], [data-site-consent]",
            ) === null,
    );
    return first ? [first] : [];
}
