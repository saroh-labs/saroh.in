import type { ReactNode } from "react";

import { cn } from "../cn";
import { Container } from "../layout/container";
import type { Crumb } from "../nav/breadcrumbs";
import { Breadcrumbs } from "../nav/breadcrumbs";
import { Mark } from "./mark";
import { SectionHeading } from "./section-heading";

/**
 * A title with the site mark (KIT.md) under one word: `word` when given and
 * found, else the last word. The mark runs to the next space, so a word's
 * punctuation stays with it and the heading's name reads unbroken.
 */
export function markTitle(title: string, word?: string): ReactNode {
    const found = word ? title.lastIndexOf(word) : -1;
    const start = found >= 0 ? found : title.trimEnd().lastIndexOf(" ") + 1;
    const space = title.indexOf(" ", found >= 0 ? found : start);
    const end = space < 0 ? title.length : space;
    return (
        <>
            {title.slice(0, start)}
            <Mark>{title.slice(start, end)}</Mark>
            {title.slice(end)}
        </>
    );
}

/**
 * The redesigned page head for the pages without a board of their own
 * (about, help, legal, tools …), on both editions: the crumb trail, the one
 * h1 at the kit's size with its mark, a lead and the page's own actions.
 * `children` sits under the lead (buttons, a search box, a date line).
 */
export function PageHero({
    crumbs,
    title,
    mark,
    lead,
    children,
    width,
    className,
}: {
    crumbs?: Crumb[];
    title: string;
    /** The word to underline; the last word when unset. */
    mark?: string;
    lead?: ReactNode;
    children?: ReactNode;
    width?: "page" | "article" | "list";
    className?: string;
}) {
    return (
        <Container
            width={width}
            className={cn(
                "grid gap-6 pb-12 pt-8 min-[760px]:pb-16 min-[760px]:pt-10",
                className,
            )}
        >
            {crumbs ? <Breadcrumbs crumbs={crumbs} /> : null}
            <SectionHeading
                as="h1"
                size="kit-h1"
                title={markTitle(title, mark)}
                lead={lead}
            />
            {children}
        </Container>
    );
}
