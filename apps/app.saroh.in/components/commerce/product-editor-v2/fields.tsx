import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The editor's field scale, from the design: 12.5px labels, 36px boxes at
 * 13px (monospace at 12.5px for codes), 11.5px help under them. A field with
 * something to fix says so with its border and its help line, not a fill.
 */
export function boxClass({
    bad = false,
    mono = false,
    small = false,
}: { bad?: boolean; mono?: boolean; small?: boolean } = {}): string {
    return cn(
        "w-full rounded-[8px] border bg-card px-2.5 text-foreground placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground coarse:h-11",
        small ? "h-8" : "h-9",
        mono ? "font-mono text-[12.5px]" : "text-[13px]",
        bad ? "border-destructive" : "border-border",
    );
}

export function FieldLabel({
    htmlFor,
    children,
    required,
    aside,
    className,
}: {
    htmlFor?: string;
    children: ReactNode;
    /** "Required" beside the label, while creating. */
    required?: boolean;
    /** Right of the label: a shop switch, or a quiet note. */
    aside?: ReactNode;
    className?: string;
}) {
    const label = htmlFor ? (
        <label htmlFor={htmlFor} className="flex-1 text-[12.5px] font-medium">
            {children}
            {required ? <Required /> : null}
        </label>
    ) : (
        <span className="flex-1 text-[12.5px] font-medium">
            {children}
            {required ? <Required /> : null}
        </span>
    );
    return (
        <div className={cn("mb-1.5 flex items-center gap-2.5", className)}>
            {label}
            {aside}
        </div>
    );
}

function Required() {
    return (
        <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
            Required
        </span>
    );
}

export function FieldHelp({
    children,
    tone = "quiet",
    className,
    id,
}: {
    children: ReactNode;
    tone?: "quiet" | "bad" | "warn";
    className?: string;
    id?: string;
}) {
    return (
        <p
            id={id}
            className={cn(
                "text-pretty text-[11.5px] leading-[1.5]",
                tone === "bad"
                    ? "text-destructive"
                    : tone === "warn"
                      ? "text-brand-subtle-foreground"
                      : "text-muted-foreground",
                className,
            )}
        >
            {children}
        </p>
    );
}

/** "14 / 150" beside a field, red once it is over. */
export function Count({ value, max }: { value: number; max: number }) {
    return (
        <span
            className={cn(
                "shrink-0 font-mono text-[11px]",
                value > max ? "text-destructive" : "text-muted-foreground",
            )}
        >
            {value} / {max}
        </span>
    );
}

/** The currency's sign ("₹") inside the left of a money box. */
export function MoneyBox({
    symbol,
    children,
    small = false,
}: {
    symbol: string;
    children: ReactNode;
    small?: boolean;
}) {
    return (
        <div className="relative min-w-0">
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute left-2.5 top-0 flex items-center text-muted-foreground",
                    small ? "h-8 text-[12.5px]" : "h-9 text-[13px]",
                    "coarse:h-11",
                )}
            >
                {symbol}
            </span>
            {children}
        </div>
    );
}
