import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";
import { useId } from "react";

import type { ServiceDraft, ServiceField } from "@/lib/services/service-editor";

/*
 * The Service Editor's small parts, after the design: a section card with
 * its title, a label over a field, and the grey note under one.
 */

/**
 * A caption over a group of controls (a set of chips, the weekly hours):
 * the one label size, as `Field` draws it over a single control.
 */
export const LABEL = "block text-[0.78125rem] font-medium leading-none";
export const HELP =
    "mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground";

/**
 * What a section is handed to edit the page's one draft: the draft, a way
 * to change it, what is wrong with a field once that should be said (it
 * has been left, or Save was pressed), and a way to say a field was left.
 */
export interface Edit {
    draft: ServiceDraft;
    set: (patch: Partial<ServiceDraft>) => void;
    problem: (field: ServiceField) => string | null;
    leave: (field: ServiceField) => void;
}

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
    error,
    onLeave,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** The design's width for this field, as a Tailwind class. */
    width: string;
    error?: string | null;
    onLeave?: () => void;
}) {
    return (
        <Field label={label} error={error} onBlur={onLeave}>
            <Input
                inputMode="numeric"
                value={value}
                onChange={(e) =>
                    onChange(e.target.value.replace(/[^0-9]/g, ""))
                }
                className={cn(width, "max-w-full")}
            />
        </Field>
    );
}
