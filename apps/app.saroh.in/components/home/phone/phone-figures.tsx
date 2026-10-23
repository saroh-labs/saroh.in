import { AbsentValue } from "@saroh/ui/absent-value";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { PhoneFigure } from "@/lib/home/phone-home";

const COLUMNS = ["grid-cols-1", "grid-cols-2", "grid-cols-3"];

/**
 * The phone Home's figures (DEC-171, plan U17, A1, board `HPHome`): one
 * row of three in one card, each a link to the screen that answers it,
 * the same places the desk's tiles open (`HATilesD`). The figure is the
 * business's, so it stays masked in a session recording; the word under
 * it is Saroh's.
 */
export function PhoneFigures({ figures }: { figures: readonly PhoneFigure[] }) {
    if (figures.length === 0) return null;
    return (
        <ul
            aria-label="Today at a glance"
            data-phone-figures=""
            className={cn(
                "grid overflow-hidden rounded-[14px] border border-border bg-card",
                COLUMNS[Math.min(figures.length, 3) - 1],
            )}
        >
            {figures.map((f, i) => (
                <li key={f.key} className="min-w-0">
                    <Link
                        href={f.href}
                        data-figure={f.key}
                        className={cn(
                            "flex h-full min-h-16 flex-col justify-center gap-0.5 px-3 py-2.5 text-foreground transition-colors duration-fast hover:text-foreground active:bg-muted",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            i > 0 && "border-l border-border",
                        )}
                    >
                        <span className="font-display text-xl font-semibold tabular-nums leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">
                            {f.value ?? (
                                <AbsentValue says={f.absent ?? "None"} />
                            )}
                        </span>
                        <span
                            data-ph-unmask=""
                            className="text-[12.5px] text-muted-foreground"
                        >
                            {f.label}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
