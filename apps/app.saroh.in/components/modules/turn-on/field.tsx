"use client";

import type { ReactNode } from "react";

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
