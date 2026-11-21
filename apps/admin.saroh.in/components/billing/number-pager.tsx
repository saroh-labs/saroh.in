import { buttonVariants } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { LinkPending } from "@saroh/ui/link-pending";
import Link from "next/link";

/**
 * Previous and Next for a list paged by number, keeping its filters. With
 * no total known, "Next page" shows while the page came back full.
 */
export function NumberPager({
    page,
    hasNext,
    href,
    pages,
}: {
    page: number;
    hasNext: boolean;
    href: (page: number) => string;
    /** How many pages there are, when the API says. */
    pages?: number;
}) {
    if (page <= 1 && !hasNext) return null;
    return (
        <nav
            aria-label="Pages"
            className="flex flex-wrap items-center justify-end gap-2"
        >
            <span className="text-sm text-muted-foreground">
                {pages ? `Page ${page} of ${pages}` : `Page ${page}`}
            </span>
            {page > 1 && (
                <Link
                    href={href(page - 1)}
                    className={cn(
                        "relative",
                        buttonVariants({ variant: "ghost", size: "sm" }),
                    )}
                >
                    Previous page
                    <LinkPending />
                </Link>
            )}
            {hasNext && (
                <Link
                    href={href(page + 1)}
                    className={cn(
                        "relative",
                        buttonVariants({
                            variant: "outline",
                            size: "sm",
                        }),
                    )}
                >
                    Next page
                    <LinkPending />
                </Link>
            )}
        </nav>
    );
}
