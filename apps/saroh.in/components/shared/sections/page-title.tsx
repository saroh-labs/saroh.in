import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

/**
 * A page's H1 (DEC-195, V6), in one of two sizes:
 * - `page` — an index page: Help, Changelog, Integrations, Templates.
 * - `article` — one thing: a changelog entry, a help article, an
 *   integration, a template, a legal page, a tool.
 *
 * Feature, solution, Home and Pricing heroes keep their display sizes.
 */
export function PageTitle({
    size,
    className,
    ...props
}: HTMLAttributes<HTMLHeadingElement> & { size: "page" | "article" }) {
    return (
        <h1
            className={cn(
                "m-0 font-display font-bold [text-wrap:balance]",
                size === "page" ? "text-mk-page" : "text-mk-article",
                className,
            )}
            {...props}
        />
    );
}
