import { Badge } from "@saroh/ui/badge";
import Link from "next/link";

import { personHref } from "@/lib/contacts/person-href";
import type { ClassWaitlistRow } from "@/lib/services/class-waitlist-words";
import {
    heldText,
    joinedText,
    WAITLIST_NOTE,
} from "@/lib/services/class-waitlist-words";

/**
 * A class's waitlist on its booking (round-2 A12; the Course Detail
 * design's Waitlist card, for one session): who is in line, in order, each
 * a link to their page. A place held for someone reads "Place held until
 * ‹time›"; everyone else "Since ‹day›". Read-only: customers join and leave
 * from the booking page, and the API offers a freed place.
 *
 * `rows` null is a read that failed, said as such — never "Nobody waiting".
 */
export function ClassWaitlist({
    rows,
    timezone,
}: {
    rows: ClassWaitlistRow[] | null;
    timezone: string;
}) {
    return (
        <section
            aria-labelledby="class-waitlist-title"
            className="mt-6 rounded-lg border border-border p-5"
        >
            <div className="flex items-baseline gap-2">
                <h2 id="class-waitlist-title" className="text-sm font-medium">
                    Waitlist
                </h2>
                {rows && rows.length > 0 ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {rows.length}
                    </span>
                ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
                {WAITLIST_NOTE}
            </p>
            {rows === null ? (
                <p className="mt-3 text-sm text-destructive">
                    We couldn&apos;t load the waitlist. Refresh the page to try
                    again.
                </p>
            ) : rows.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    Nobody waiting.
                </p>
            ) : (
                <ol className="mt-2">
                    {rows.map((row, i) => (
                        <li
                            key={row.id}
                            className="flex flex-wrap items-center gap-2 border-t border-border py-2 first:border-t-0"
                        >
                            <span
                                aria-hidden="true"
                                className="w-[22px] text-xs font-bold tabular-nums text-muted-foreground"
                            >
                                {i + 1}
                            </span>
                            <div className="min-w-0 flex-[1_1_120px]">
                                <Link
                                    href={personHref(row.contactId)}
                                    className="cursor-pointer rounded-sm text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground/70"
                                >
                                    {row.name ?? row.email ?? "A customer"}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                    {row.status === "OFFERED" &&
                                    row.offeredUntil
                                        ? heldText(row.offeredUntil, timezone)
                                        : joinedText(row.joinedAt, timezone)}
                                </p>
                            </div>
                            {row.status === "OFFERED" ? (
                                <Badge variant="success">Offered</Badge>
                            ) : null}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
