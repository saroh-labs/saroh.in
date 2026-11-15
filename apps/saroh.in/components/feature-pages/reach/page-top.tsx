import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import type { ReactNode } from "react";

import { KEEP } from "@/content/feature-keep";
import { HOW_IT_WORKS } from "@/content/how-it-works";

/**
 * A Reach or Ask page's opening (FW, FS, FA): "How it works / {name}", the
 * one h1 (its Mark under one word), and beside it on desk, under it on a
 * phone, the lede, the buttons and the free line. `children` is the hero's
 * visual, under both. The hero's start button carries `heroCtaId`, which
 * the phone's StickyBar watches.
 */
export function PageTop({
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
        <Container
            as="section"
            aria-labelledby="page-title"
            className={className}
        >
            <Breadcrumbs
                className="pt-6"
                crumbs={[
                    { name: KEEP.crumb, href: HOW_IT_WORKS.href },
                    { name },
                ]}
            />
            <div
                className={cn(
                    "grid items-end gap-6 pt-5 min-[760px]:pt-7",
                    stacked
                        ? "min-[1080px]:grid-cols-[640px_1fr] min-[1080px]:gap-x-20 min-[1080px]:gap-y-10"
                        : "min-[1080px]:grid-cols-[1fr_440px] min-[1080px]:gap-16",
                )}
            >
                <h1
                    id="page-title"
                    className={cn(
                        "m-0 max-w-[16ch] font-display text-mk-kit-h1 font-bold [text-wrap:balance]",
                        stacked &&
                            "min-[1080px]:col-span-2 min-[1080px]:max-w-[1060px]",
                    )}
                >
                    {title}
                </h1>
                {stacked ? (
                    <p className="m-0 text-mk-kit-lead text-mk-copy [text-wrap:pretty]">
                        {lede}
                    </p>
                ) : null}
                <div>
                    {stacked ? null : (
                        <p className="m-0 text-mk-kit-lead text-mk-copy [text-wrap:pretty]">
                            {lede}
                        </p>
                    )}
                    {aside}
                    <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
                    {note ? (
                        <p className="m-0 mt-5 text-[15px] text-muted-foreground">
                            {note}
                        </p>
                    ) : null}
                </div>
            </div>
            {children ? (
                <div className={cn("mt-10 min-[760px]:mt-14")}>{children}</div>
            ) : null}
        </Container>
    );
}

/** The id of a page's hero start button: what its StickyBar watches. */
export const HERO_CTA = "hero-start";
