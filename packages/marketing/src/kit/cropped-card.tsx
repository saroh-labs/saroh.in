import type { ReactNode } from "react";

import { cn } from "../cn";
import { ring } from "../ring";

/**
 * A screen cropped to the rows that make the point (PHONE.md: crop, don't
 * shrink). The card is cut at `height` with a 48px fade, and under it a
 * TextLink, "See the whole order", with no arrow: it opens the rest here.
 *
 * Google reads the phone page, so what is folded stays in the HTML: `more`
 * sits in a closed `<details>` right after the card, never loaded on tap.
 * The card's own words come from the page, as do `more`'s label and body.
 */
export function CroppedCard({
    children,
    more,
    height = 320,
    surface = "white",
    className,
}: {
    /** The rows shown, at full size. */
    children: ReactNode;
    /** What "See the whole …" opens: its words, and the whole thing. */
    more?: { label: string; content: ReactNode };
    /** Where the card is cut, in px. */
    height?: number;
    /** The card's fill, which the fade runs into. */
    surface?: "white" | "paper";
    className?: string;
}) {
    return (
        <div className={cn("grid gap-2", className)}>
            <div
                className={cn(
                    "relative overflow-hidden rounded-mk-card border border-border",
                    surface === "white" ? "bg-card" : "bg-background",
                )}
                style={{ maxHeight: height }}
            >
                {children}
                <div
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent",
                        surface === "white" ? "to-card" : "to-background",
                    )}
                />
            </div>
            {more ? (
                <details className="group">
                    <summary
                        className={`inline-flex min-h-11 w-fit cursor-pointer list-none items-center rounded-sm font-semibold text-foreground underline decoration-border-strong decoration-1 underline-offset-[3px] hover:decoration-foreground [&::-webkit-details-marker]:hidden ${ring()}`}
                    >
                        {more.label}
                    </summary>
                    <div className="mt-3">{more.content}</div>
                </details>
            ) : null}
        </div>
    );
}
