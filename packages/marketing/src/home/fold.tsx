import { ChevronDown } from "lucide-react";
import type { DetailsHTMLAttributes, ReactNode } from "react";

import { cn } from "../cn";
import { ring } from "../ring";

/**
 * The landing's one fold (PHONE.md, DEC-221): a TextLink-styled summary,
 * "See the whole list", that opens content already in the HTML, in a
 * closed `<details>` (Google reads the phone page). CroppedCard's fold
 * without its card, for the folds that cut no screen.
 */
export function Fold({
    summary,
    tone = "ink",
    chevron = false,
    className,
    children,
    ...props
}: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "children"> & {
    summary: ReactNode;
    tone?: "ink" | "on-ink";
    chevron?: boolean;
    children?: ReactNode;
}) {
    return (
        <details className={cn("group", className)} {...props}>
            <summary
                className={cn(
                    "inline-flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-sm font-semibold underline decoration-1 underline-offset-[3px] [&::-webkit-details-marker]:hidden",
                    tone === "ink"
                        ? "text-foreground decoration-border-strong"
                        : "text-mk-lamp-fg decoration-mk-on-ink-line",
                    ring(),
                )}
            >
                {summary}
                {chevron ? (
                    <ChevronDown
                        aria-hidden
                        className="size-[18px] shrink-0 text-muted-foreground transition-transform duration-base ease-out group-open:rotate-180 motion-reduce:transition-none"
                    />
                ) : null}
            </summary>
            {children}
        </details>
    );
}
