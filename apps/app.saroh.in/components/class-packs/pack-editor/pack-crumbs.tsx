import Link from "next/link";

/** A link in the crumb strip: quiet, with hover, focus and pressed states. */
export const CRUMB_LINK =
    "rounded-[4px] text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70 coarse:inline-flex coarse:min-h-11 coarse:items-center";

function Chevron() {
    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-3 shrink-0 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M9.5 5 L16.5 12 L9.5 19" />
        </svg>
    );
}

/**
 * "Bookings › Packs › Ten classes", the strip over the Pack Editor (the
 * design's crumb bar). `here` is the pack's name, or "New pack".
 */
export function PackCrumbs({ here }: { here: string | null }) {
    return (
        <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px] text-[12px]"
        >
            <Link href="/bookings" className={CRUMB_LINK}>
                Bookings
            </Link>
            <Chevron />
            <Link href="/class-packs" className={CRUMB_LINK}>
                Packs
            </Link>
            {here ? (
                <>
                    <Chevron />
                    <span
                        aria-current="page"
                        className="min-w-0 break-words text-foreground"
                    >
                        {here}
                    </span>
                </>
            ) : null}
        </nav>
    );
}
