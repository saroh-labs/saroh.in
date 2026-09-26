import { buttonVariants } from "@saroh/ui/button";
import Link from "next/link";

/** "First page" and "Next page" for a cursor-paged list driven by the query string. */
export function Pager({
    base,
    params,
    nextCursor,
}: {
    base: string;
    params: Record<string, string | undefined>;
    nextCursor?: string;
}) {
    const href = (cursor?: string) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries({ ...params, cursor })) {
            if (value) search.set(key, value);
        }
        return search.size > 0 ? `${base}?${search.toString()}` : base;
    };
    if (!params.cursor && !nextCursor) return null;
    return (
        <nav aria-label="Pages" className="flex flex-wrap justify-end gap-2">
            {params.cursor && (
                <Link
                    href={href(undefined)}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                    First page
                </Link>
            )}
            {nextCursor && (
                <Link
                    href={href(nextCursor)}
                    className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                    })}
                >
                    Next page
                </Link>
            )}
        </nav>
    );
}
