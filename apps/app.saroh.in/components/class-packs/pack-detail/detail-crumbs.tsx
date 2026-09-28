import Link from "next/link";

/** The page's gutter: the design's 22px, 16px on a phone. */
export const GUTTER = "px-[22px] max-[759px]:px-4";

/**
 * The bar over Pack Detail (E16, the design's crumb bar): "‹ Packs / Ten
 * classes", and on the right whether the booking page shows it.
 */
export function DetailCrumbs({
    here,
    aside,
}: {
    here: string;
    /** "On the booking page" or "Not on the booking page"; none while loading. */
    aside?: string;
}) {
    return (
        <div className="flex min-h-[47px] flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px]">
            <Link
                href="/class-packs"
                className="flex items-center gap-[7px] rounded-[8px] px-[9px] py-1.5 text-[12.5px] text-foreground/80 transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active coarse:min-h-11"
            >
                <svg
                    aria-hidden
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                >
                    <path
                        d="M14.5 5 L7.5 12 L14.5 19"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
                Packs
            </Link>
            <span aria-hidden className="text-[15px] text-muted-foreground">
                /
            </span>
            <span
                aria-current="page"
                className="min-w-0 truncate text-[13.5px] font-semibold"
            >
                {here}
            </span>
            {aside ? (
                // Words, not a link: the app doesn't know the booking page's
                // address here, and a link-coloured label would promise one.
                <span className="ml-auto px-[9px] py-1.5 text-[12.5px] font-medium text-muted-foreground">
                    {aside}
                </span>
            ) : null}
        </div>
    );
}
