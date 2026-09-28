import { Button } from "@saroh/ui/button";
import Link from "next/link";

import type { Edge } from "@/lib/calendar/range";

/**
 * ‹ or ›: a link to the next month, or — at the edge of what the calendar
 * reaches — a greyed button that stays focusable and says why.
 */
export function MonthStep({
    href,
    label,
    edge,
    children,
}: {
    href: string;
    label: string;
    edge: Edge | null;
    children: React.ReactNode;
}) {
    if (edge) {
        return (
            <Button
                type="button"
                variant="outline"
                size="sm"
                aria-disabled
                aria-label={label}
                aria-describedby="calendar-edge"
                title={edge.title}
                className="w-8 cursor-default px-0 text-muted-foreground hover:bg-card hover:text-muted-foreground"
            >
                {children}
            </Button>
        );
    }
    return (
        <Button asChild variant="outline" size="sm" className="w-8 px-0">
            <Link href={href} aria-label={label}>
                {children}
            </Link>
        </Button>
    );
}
