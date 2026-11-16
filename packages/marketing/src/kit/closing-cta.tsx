import type { ReactNode } from "react";

import { cn } from "../cn";
import type { World } from "../content/world";
import { Container } from "../layout/container";
import type { ClosingName } from "./closing-address";
import { ClosingAddress } from "./closing-address";

/**
 * A page's last word (KIT.md), the Ink band "K" (owner, 16 Nov 2026, #46):
 * one heading, then its `visual` (by default the address typing
 * each demo business, `ClosingAddress`, whose names each site sets in its
 * layout), the primary "Start free" and a secondary by page type (a feature
 * page links its trade-day moment, a trade page its template). Both buttons
 * come from the site (`cta()`), so the launch switch moves them; inside the
 * band (`data-on-ink`) they take their on-Ink look. `note` defaults to "Live
 * the moment you publish. Free to start, no card." On a phone the band is
 * tighter, and the sticky bar hides while it is in view, so its Start free
 * shows once.
 */
/** The heading that goes with the typing address, the same on every page (owner, 16 Nov 2026). */
export const ADDRESS_TITLE = "Your place is one name away.";

export function ClosingCTA({
    id = "start",
    title,
    primary,
    secondary,
    note = "Live the moment you publish. Free to start, no card.",
    visual,
    className,
}: {
    id?: string;
    /** Shown only when `visual` is passed (a picture, or `null`); the typing address always has `ADDRESS_TITLE`. */
    title: ReactNode;
    primary: ReactNode;
    secondary?: ReactNode;
    note?: ReactNode;
    /** Replaces the typing address and name chips (a page's own picture); `null` for none, keeping the page's own heading. */
    visual?: ReactNode;
    className?: string;
}) {
    return (
        <section
            aria-labelledby={`${id}-title`}
            // The sticky bar steps aside while this is on screen (`StickyBar`).
            data-closing=""
            // Paper buttons inside take their on-Ink look (`buttonClasses`).
            data-on-ink=""
            className={cn("bg-foreground text-background", className)}
        >
            <Container className="grid justify-items-start gap-5 py-14 min-[760px]:gap-8 min-[760px]:py-[120px]">
                <h2
                    id={`${id}-title`}
                    className="m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold text-background [text-wrap:balance]"
                >
                    {visual === undefined ? ADDRESS_TITLE : title}
                </h2>
                {visual === undefined ? <ClosingAddress /> : visual}
                <div className="mt-4 flex flex-wrap gap-3 min-[760px]:mt-10">
                    {primary}
                    {secondary}
                </div>
                {note ? (
                    <p className="m-0 text-[15px] text-mk-on-ink-muted">
                        {note}
                    </p>
                ) : null}
            </Container>
        </section>
    );
}

/** A world's businesses as the band's names: the lead, then the others. */
export function closingNames(world: World): ClosingName[] {
    return [world.lead, ...world.others].flatMap((b) =>
        b.look
            ? [
                  {
                      name: b.name,
                      slug: b.site.replace(/\.saroh\.app$/, ""),
                      look: b.look,
                  },
              ]
            : [],
    );
}
