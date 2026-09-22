import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";

/**
 * The two views of Class packs: what is sold, and who holds one. Links, not
 * state, so each has an address a merchant can come back to.
 */
export function ClassPacksTabs({ current }: { current: "packs" | "holders" }) {
    const tabs = [
        { id: "packs", href: "/class-packs", label: "Packs" },
        {
            id: "holders",
            href: "/class-packs/purchases",
            label: "Who holds one",
        },
    ] as const;
    return (
        <nav aria-label="Class packs" className={cn("flex", SEGMENTED)}>
            {tabs.map((t) => (
                <Link
                    key={t.id}
                    href={t.href}
                    aria-current={current === t.id ? "page" : undefined}
                    data-state={current === t.id ? "on" : "off"}
                    className={cn(
                        "inline-flex items-center rounded-md",
                        SEGMENT,
                    )}
                >
                    {t.label}
                </Link>
            ))}
        </nav>
    );
}
