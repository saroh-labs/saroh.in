import type { ReactNode } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";
import type { Crumb } from "../nav/breadcrumbs";
import { Breadcrumbs } from "../nav/breadcrumbs";

/** Each layout's columns; a page passes `gridClassName` to set its own. */
const COLS = {
    split: "min-[1080px]:grid-cols-[minmax(0,1fr)_440px] min-[1080px]:gap-16",
    stacked:
        "min-[1080px]:grid-cols-[640px_1fr] min-[1080px]:gap-x-20 min-[1080px]:gap-y-10",
    beside: "min-[1080px]:grid-cols-[minmax(0,1fr)_minmax(0,560px)] min-[1080px]:gap-16",
    center: "justify-items-start min-[760px]:justify-items-center min-[760px]:text-center",
} as const;

/**
 * A page's opening, drawn once for every page that has one (bug #48): the
 * crumb trail, the one h1 (the page wraps one word in `Mark`), the lede, an
 * optional note (a plan line, a pill, a switch), the start button and a
 * second one, and the small foot note ("Free to start").
 *
 * - `split` — the h1 on the left, the words and buttons on the right (Keep,
 *   Website, Ask AI); `children` (the picture) under both.
 * - `stacked` — the h1 across, the lede under it on the left, the buttons on
 *   the right (Share).
 * - `beside` — the h1 and the words in one column, `picture` beside it (AI
 *   apps, a trade page, the Solutions hub without one).
 * - `center` — centred on desk, left on a phone (Home).
 *
 * The columns are top-aligned (`items-start`), never bottom: a bottom-aligned
 * head drops the h1 below its words (#9, #26, #47), and
 * `split-hero.test.tsx` fails if it comes back anywhere in the package.
 * The start button's wrapper keeps the id a page's StickyBar watches; the
 * page passes it in `primary`.
 */
export function SplitHero({
    id,
    crumbs,
    crumbsCurrent = "plain",
    crumbsClassName,
    title,
    lede,
    note,
    primary,
    secondary,
    foot,
    more,
    picture,
    layout = "split",
    as = "section",
    contained = true,
    className,
    gridClassName,
    titleClassName,
    ledeClassName,
    children,
}: {
    /** The h1's id; the section is labelled by it. */
    id?: string;
    crumbs?: Crumb[];
    crumbsCurrent?: "plain" | "brand";
    crumbsClassName?: string;
    title: ReactNode;
    lede?: ReactNode;
    /** Between the lede and the buttons; brings its own spacing. */
    note?: ReactNode;
    primary?: ReactNode;
    secondary?: ReactNode;
    foot?: ReactNode;
    /** Under the foot note, in the words' column (an example's note). */
    more?: ReactNode;
    /** `beside` only: the picture in the second column. */
    picture?: ReactNode;
    layout?: keyof typeof COLS;
    as?: "section" | "div";
    /** False inside a parent that already sets the page column (the hub). */
    contained?: boolean;
    className?: string;
    /** Replaces the layout's columns and gaps. */
    gridClassName?: string;
    titleClassName?: string;
    ledeClassName?: string;
    /** Under the head; in `beside`, more cells of its grid. */
    children?: ReactNode;
}) {
    const center = layout === "center";
    const h1 = (
        <h1
            id={id}
            className={cn(
                "m-0 max-w-[16ch] font-display text-mk-kit-h1 font-bold [text-wrap:balance]",
                layout === "stacked" &&
                    "min-[1080px]:col-span-2 min-[1080px]:max-w-[1060px]",
                titleClassName,
            )}
        >
            {title}
        </h1>
    );
    const ledeP = lede ? (
        <p
            className={cn(
                "m-0 text-mk-kit-lead text-mk-copy [text-wrap:pretty]",
                center && "mt-4 max-w-[780px] min-[760px]:mt-[22px]",
                layout === "beside" && "mt-6",
                ledeClassName,
            )}
        >
            {lede}
        </p>
    ) : null;
    const actions =
        primary || secondary ? (
            <div
                className={cn(
                    "flex flex-wrap items-center gap-3",
                    center
                        ? "mt-5 w-full min-[760px]:mt-[30px] min-[760px]:w-auto min-[760px]:justify-center"
                        : "mt-7",
                )}
            >
                {primary}
                {secondary}
            </div>
        ) : null;
    const tail = (
        <>
            {note}
            {actions}
            {foot ? (
                <p
                    className={cn(
                        "m-0 text-muted-foreground",
                        center ? "mt-2.5 text-[14px]" : "mt-5 text-[15px]",
                    )}
                >
                    {foot}
                </p>
            ) : null}
            {more}
        </>
    );

    const head =
        layout === "split" ? (
            <>
                {h1}
                <div className="min-w-0">
                    {ledeP}
                    {tail}
                </div>
            </>
        ) : layout === "stacked" ? (
            <>
                {h1}
                {ledeP}
                <div className="min-w-0">{tail}</div>
            </>
        ) : layout === "beside" ? (
            <>
                <div className="grid min-w-0 content-start">
                    {h1}
                    {ledeP}
                    {tail}
                </div>
                {picture}
                {children}
            </>
        ) : (
            <>
                {h1}
                {ledeP}
                {tail}
            </>
        );

    const body = (
        <>
            {crumbs ? (
                <Breadcrumbs
                    crumbs={crumbs}
                    current={crumbsCurrent}
                    className={crumbsClassName}
                />
            ) : null}
            <div
                className={cn(
                    "grid grid-cols-[minmax(0,1fr)] items-start",
                    !center && "gap-6",
                    crumbs && "pt-5 min-[760px]:pt-7",
                    gridClassName ?? COLS[layout],
                )}
            >
                {head}
            </div>
            {layout === "beside" ? null : children}
        </>
    );

    const label = id && as === "section" ? id : undefined;
    return contained ? (
        <Container as={as} aria-labelledby={label} className={className}>
            {body}
        </Container>
    ) : as === "section" ? (
        <section aria-labelledby={label} className={className}>
            {body}
        </section>
    ) : (
        <div className={className}>{body}</div>
    );
}
