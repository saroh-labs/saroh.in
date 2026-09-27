import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";
import { useId } from "react";

/*
 * The Service Editor's small parts, after the design: a section card with
 * its title, a label over a field, and the grey note under one.
 */

export const LABEL = "block text-[13px] font-medium";
export const FIELD = "mt-[5px] h-[38px] rounded-[8px] text-[14px] font-normal";
export const HELP =
    "mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground";

/** A titled card, the design's section. */
export function Section({
    title,
    children,
    className,
}: {
    title: string;
    children: ReactNode;
    className?: string;
}) {
    const id = useId();
    return (
        <section
            aria-labelledby={id}
            className={cn(
                "min-w-0 rounded-[12px] border border-border bg-card px-[18px] py-4",
                className,
            )}
        >
            <h2
                id={id}
                className="mb-2.5 font-display text-[16px] font-semibold tracking-[-0.01em]"
            >
                {title}
            </h2>
            {children}
        </section>
    );
}

/** Whole minutes or places: digits only, as the design's fields take them. */
export function NumberField({
    label,
    value,
    onChange,
    width,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** The design's width for this field, as a Tailwind class. */
    width: string;
}) {
    const id = useId();
    return (
        <div className="min-w-0">
            <label htmlFor={id} className={LABEL}>
                {label}
            </label>
            <Input
                id={id}
                inputMode="numeric"
                value={value}
                onChange={(e) =>
                    onChange(e.target.value.replace(/[^0-9]/g, ""))
                }
                className={cn(FIELD, width, "max-w-full")}
            />
        </div>
    );
}
