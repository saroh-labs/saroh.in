import { ChevronDown } from "lucide-react";
import type { DetailsHTMLAttributes, ReactNode } from "react";

import { cn } from "../cn";
import { foldSummaryClasses } from "../kit/phone-fold";

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
            <summary className={foldSummaryClasses(tone)}>
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
