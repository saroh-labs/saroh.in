import Link from "next/link";

/**
 * Says a list is narrowed to the last 24 hours (`?since=`, round 2, F6) and
 * offers the whole list back. A list opened from Home's "3 new orders" must
 * not pass for every order, so the narrowing is said, not only applied.
 */
export function SinceNotice({
    count,
    noun,
    verb,
    clearHref,
}: {
    count: number;
    noun: { one: string; other: string };
    /** "placed", "made", "left", "paid". */
    verb: string;
    clearHref: string;
}) {
    return (
        <p
            role="status"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-[13px] text-foreground/80"
        >
            <span>
                {count === 0
                    ? `No ${noun.other} ${verb} in the last 24 hours.`
                    : `Only the ${count === 1 ? noun.one : `${count} ${noun.other}`} ${verb} in the last 24 hours.`}
            </span>
            <Link
                href={clearHref}
                className="rounded-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                Show all {noun.other}
            </Link>
        </p>
    );
}
