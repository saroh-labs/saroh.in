import type { ReactNode } from "react";
import { SplitHero } from "../../sections/split-hero";

/**
 * A Reach or Ask page's opening (FW, FS, FA): "How it works / {name}", the
 * one h1 (its Mark under one word), and beside it on desk, under it on a
 * phone, the lede, the buttons and the free line. `children` is the hero's
 * visual, under both. The hero's start button carries `heroCtaId`, which
 * the phone's StickyBar watches. Drawn by `SplitHero`.
 */
export function PageTop({
    crumb,
    name,
    title,
    lede,
    actions,
    note,
    aside,
    stacked = false,
    children,
    className,
}: {
    /** The level above: "Features", at /features. */
    crumb: { name: string; href: string };
    name: string;
    title: ReactNode;
    lede: ReactNode;
    actions: ReactNode;
    note?: ReactNode;
    /** Anything between the lede and the buttons (a plan line, a pill). */
    aside?: ReactNode;
    /** The h1 across the page, the lede and buttons in a row under it (FS). */
    stacked?: boolean;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <SplitHero
            id="page-title"
            crumbs={[crumb, { name }]}
            crumbsClassName="pt-6"
            layout={stacked ? "stacked" : "split"}
            title={title}
            lede={lede}
            note={aside}
            secondary={actions}
            foot={note}
            className={className}
        >
            {children ? (
                <div className="mt-10 min-[760px]:mt-14">{children}</div>
            ) : null}
        </SplitHero>
    );
}

/** The id of a page's hero start button: what its StickyBar watches. */
export const HERO_CTA = "hero-start";
