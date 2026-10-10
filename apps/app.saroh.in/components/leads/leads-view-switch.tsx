import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";

/**
 * Leads' two views of the same leads: the board by stage (`/pipeline`) and
 * the list (`/leads`). Links, not state, so each keeps its address, as
 * Bookings' Calendar | List does: Home's "Open leads" still lands on the
 * list and a stage link on the board. Each used to offer the other as a
 * loose button in its header.
 */
export function LeadsViewSwitch({ current }: { current: "board" | "list" }) {
    const views = [
        { id: "board", href: "/pipeline", label: "Board" },
        { id: "list", href: "/leads", label: "List" },
    ] as const;
    return (
        <nav aria-label="Leads view" className={cn("flex", SEGMENTED)}>
            {views.map((v) => (
                <Link
                    key={v.id}
                    href={v.href}
                    aria-current={current === v.id ? "page" : undefined}
                    data-state={current === v.id ? "on" : "off"}
                    className={cn(
                        "inline-flex items-center rounded-md",
                        SEGMENT,
                    )}
                >
                    {v.label}
                </Link>
            ))}
        </nav>
    );
}
