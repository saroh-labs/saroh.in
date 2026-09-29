import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";
import { useId } from "react";

import { Chip } from "@/components/shared/chip";

/*
 * The Pack Editor's small parts, after the design: a titled card, a label
 * over a field, the grey note, the red line under a field that has a
 * problem, and the design's 34px chip with its pressed state.
 */

export const LABEL = "block text-[13px] font-medium";
export const FIELD = "mt-[5px] h-[38px] rounded-[8px] text-[14px] font-normal";
export const HELP =
    "mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground";

/** A titled card, the design's section. */
export function PackSection({
    title,
    sub,
    children,
    tight = false,
}: {
    title: string;
    /** The grey line under the title ("What a credit can be used on."). */
    sub?: string;
    children: ReactNode;
    /** The side column's cards sit their title closer to what follows. */
    tight?: boolean;
}) {
    const id = useId();
    return (
        <section
            aria-labelledby={id}
            className="min-w-0 rounded-[12px] border border-border bg-card px-[18px] py-4"
        >
            <h2
                id={id}
                className={cn(
                    "font-display text-[16px] font-semibold tracking-[-0.01em]",
                    sub || tight ? "mb-1" : "mb-2.5",
                )}
            >
                {title}
            </h2>
            {sub ? (
                <p className="m-0 text-[12.5px] text-muted-foreground">{sub}</p>
            ) : null}
            {children}
        </section>
    );
}

/** The problem beside a field, which the field names in aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <p id={id} className="mt-[5px] text-[12.5px] text-destructive">
            {message}
        </p>
    );
}

/** The design's chip (34px, 13px), pressed a step darker, as Button is. */
export function PackChip({
    on,
    className,
    ...props
}: React.ComponentPropsWithoutRef<typeof Chip>) {
    return (
        <Chip
            on={on}
            className={cn(
                "h-[34px] text-[13px]",
                on ? "active:bg-primary-active" : "active:bg-accent-active",
                className,
            )}
            {...props}
        />
    );
}
