"use client";

import { Label } from "@saroh/ui/label";
import type { ReactNode } from "react";

/** The sheet's input look, as the settings sheets draw theirs. */
export const INPUT = "h-[38px] rounded-[9px] text-[14px] coarse:h-11";

/**
 * One labelled field: the label above, and below it either its refusal
 * (from the sheet's own check or the API's 400) or a note.
 */
export function Field({
    id,
    label,
    error,
    note,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    note?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={id} className="text-[12.5px] font-medium">
                {label}
            </Label>
            {children}
            {error ? (
                <span
                    id={`${id}-note`}
                    className="text-[11.5px] text-destructive-subtle-foreground"
                >
                    {error}
                </span>
            ) : note ? (
                <span
                    id={`${id}-note`}
                    className="text-pretty text-[11.5px] leading-normal text-muted-foreground"
                >
                    {note}
                </span>
            ) : null}
        </div>
    );
}

/** A section of the sheet, named when the sheet asks for more than one. */
export function Section({
    title,
    children,
}: {
    title?: string;
    children: ReactNode;
}) {
    return (
        <section className="grid min-w-0 gap-3.5">
            {title ? (
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {title}
                </h3>
            ) : null}
            {children}
        </section>
    );
}
