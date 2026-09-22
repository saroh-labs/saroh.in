import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

/**
 * Leads | Follow-ups. A page-level switch drawn like Products | Reviews: the
 * follow-ups are the tasks set ON leads, gathered in one list so nothing
 * waits on a lead nobody opens. Links, so `?tab=follow-ups` is an address.
 */
export function LeadsTabs({
    active,
    leadCount,
    taskCount,
}: {
    active: "leads" | "follow-ups";
    leadCount: number;
    taskCount: number | null;
}) {
    const tabs = [
        { id: "leads", label: "Leads", href: "/leads", count: leadCount },
        {
            id: "follow-ups",
            label: "Follow-ups",
            href: "/leads?tab=follow-ups",
            count: taskCount,
        },
    ] as const;
    return (
        <nav
            aria-label="Leads or follow-ups"
            className="flex gap-1 border-b border-border"
        >
            {tabs.map((t) => {
                const on = t.id === active;
                return (
                    <Link
                        key={t.id}
                        href={t.href}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                            "flex items-center gap-2 px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t.label}
                        {t.count === null ? null : (
                            <span
                                className={cn(
                                    "rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums",
                                    on
                                        ? "bg-muted text-foreground"
                                        : "bg-foreground/[0.04] text-muted-foreground",
                                )}
                            >
                                {t.count}
                            </span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
