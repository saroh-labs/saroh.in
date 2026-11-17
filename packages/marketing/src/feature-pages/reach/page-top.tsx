import type { ReactNode } from "react";
import { ButtonLink } from "../../buttons/button";
import { Mark } from "../../sections/mark";
import { SplitHero } from "../../sections/split-hero";

/** The words a Reach or Ask page's opening reads from its `words`. */
export interface PageTopWords {
    name: string;
    title: { before: string; mark: string };
    lede: string;
    /** The second button's words. */
    secondary: string;
    note?: string;
}

/**
 * A Reach or Ask page's opening (FW, FS, FA): "How it works / {name}", the
 * one h1 (its Mark under one word), and beside it on desk, under it on a
 * phone, the lede, the buttons (the start button, then the second one,
 * desk only, to `secondaryHref`) and the free line. `children` is the
 * hero's visual, under both. The start button sits in `HERO_CTA`, which
 * the phone's StickyBar watches. Drawn by `SplitHero`.
 */
export function PageTop({
    crumb,
    words: w,
    start,
    secondaryHref,
    aside,
    stacked = false,
    children,
    className,
}: {
    /** The level above: "Features", at /features. */
    crumb: { name: string; href: string };
    words: PageTopWords;
    /** The edition's start button. */
    start: ReactNode;
    /** Null: no second button (Pricing while the launch switch is shut). */
    secondaryHref: string | null;
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
            // Not a landmark: the h1 names the page already, and a closing
            // band that repeats the title would make two regions of one name.
            as="div"
            crumbs={[crumb, { name: w.name }]}
            crumbsClassName="pt-6"
            layout={stacked ? "stacked" : "split"}
            title={<PageTitleWords title={w.title} />}
            lede={w.lede}
            note={aside}
            secondary={
                <>
                    <span id={HERO_CTA}>{start}</span>
                    {secondaryHref ? (
                        <SecondaryButton href={secondaryHref}>
                            {w.secondary}
                        </SecondaryButton>
                    ) : null}
                </>
            }
            foot={w.note}
            className={className}
        >
            {children ? (
                <div className="mt-10 min-[760px]:mt-14">{children}</div>
            ) : null}
        </SplitHero>
    );
}

/** The h1's words: the Saffron mark under its last word. */
export function PageTitleWords({
    title,
}: {
    title: { before: string; mark: string };
}) {
    return (
        <>
            {title.before}
            <Mark>{title.mark}</Mark>
        </>
    );
}

/** The hero's second button: desk only, a phone has the start button alone. */
export function SecondaryButton({
    href,
    children,
}: {
    href: string;
    children: ReactNode;
}) {
    return (
        <ButtonLink
            href={href}
            variant="secondary"
            size="kit"
            className="max-[759px]:hidden"
        >
            {children}
        </ButtonLink>
    );
}

/** The id of a page's hero start button: what its StickyBar watches. */
export const HERO_CTA = "hero-start";
