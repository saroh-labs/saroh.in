import { cn } from "@/lib/cn";
import type { ElementType, HTMLAttributes } from "react";

const WIDTH = {
    page: "max-w-mk-page",
    /** An article's reading column: an entry, a help article, legal. */
    article: "max-w-mk-article",
    /** A list's column: the changelog, the FAQ, Help's groups. */
    list: "max-w-mk-list",
} as const;

/**
 * The page column: centred, with the design's gutters,
 * `clamp(20px, 5vw, 56px)`. `width` is the column's whole width, gutter
 * included: the page (1280px), an article (760px) or a list (900px)
 * (DEC-195, V7). Every V2 section sits in one.
 */
export function Container({
    as: Tag = "div",
    width = "page",
    className,
    ...props
}: HTMLAttributes<HTMLElement> & {
    as?: ElementType;
    width?: keyof typeof WIDTH;
}) {
    return (
        <Tag
            className={cn(
                "mx-auto w-full px-mk-gutter",
                WIDTH[width],
                className,
            )}
            {...props}
        />
    );
}

/**
 * An article's column (DEC-195, V7): a changelog entry, an integration, a
 * legal page. 760px, its blocks 24px apart, 72px below the nav.
 */
export function Article({ className, ...props }: HTMLAttributes<HTMLElement>) {
    return (
        <Container
            as="article"
            width="article"
            className={cn("grid gap-6 pt-[72px]", className)}
            {...props}
        />
    );
}
