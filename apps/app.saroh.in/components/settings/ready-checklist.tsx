import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { ReadyChecklist as Checklist } from "@/lib/settings/ready";

/**
 * "Ready to take payments" ("Saroh Settings" design): a card at the top of
 * Business listing what is left, a bar for how far along the business is,
 * and a button per step to the place that does it. Nothing renders once
 * nothing is left — the page already says the rest. The steps and the count
 * come from `readyChecklist`.
 */
export function ReadyChecklist({ list }: { list: Checklist }) {
    if (list.left.length === 0 || list.total === 0) return null;
    const pct = Math.round((100 * list.done) / list.total);
    return (
        <section
            aria-label="Ready to take payments"
            className="grid gap-2 rounded-xl border border-highlight-border bg-brand-subtle px-4 py-3"
        >
            <div className="flex flex-wrap items-baseline gap-2.5">
                <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em]">
                    Ready to take payments
                </h3>
                <span className="text-[12.5px] text-foreground/80">
                    {list.done} of {list.total} done
                </span>
                <div
                    role="progressbar"
                    aria-label="Setup done"
                    aria-valuemin={0}
                    aria-valuemax={list.total}
                    aria-valuenow={list.done}
                    className="ml-auto h-1.5 max-w-[200px] flex-[1_1_120px] self-center overflow-hidden rounded-full bg-muted"
                >
                    <div
                        className="h-full rounded-full bg-highlight"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
            <ul className="grid gap-2">
                {list.left.map((item) => (
                    <li
                        key={item.key}
                        className="flex flex-wrap items-center gap-2.5 text-[13px]"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-[7px] shrink-0 rounded-full",
                                item.broken ? "bg-destructive" : "bg-highlight",
                            )}
                        />
                        <span className="min-w-0 flex-[1_1_220px]">
                            {item.label}
                        </span>
                        <Button asChild variant="outline" size="sm">
                            <Link href={item.href}>{item.cta}</Link>
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
